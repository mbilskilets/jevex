import { vOnCompleteArgs, Workpool } from "@convex-dev/workpool";
import {
  TypeSafeClient,
  type ChoiceResponse,
  type NoulResponse,
  type Question as JevQuestion,
  type ScoreResponse,
} from "@typesafe-ai/sdk";
import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { env, internalAction, internalMutation } from "./_generated/server.js";
import { ensureDispatch, identity, settle } from "./model.js";
import { vAnswers, vJson, vQuestions, type Answer, type Question } from "./validators.js";

const DISPATCH_LIMIT = 400;
const LEASE_MS = 10 * 60 * 1000;

const pool = new Workpool(components.judges, { maxParallelism: 16, retryActionsByDefault: false });

const vRow = v.object({ id: v.id("judgments"), hash: v.string() });

type Batch = { spec: Doc<"specs">; judgments: Doc<"judgments">[] };

export const dispatch = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const dispatcher = await ctx.db.query("dispatcher").first();
    if (dispatcher) await ctx.db.patch("dispatcher", dispatcher._id, { scheduledAt: undefined });

    const queued = await ctx.db
      .query("judgments")
      .withIndex("by_status_and_spec", (q) => q.eq("status", "queued"))
      .take(DISPATCH_LIMIT);
    const specIds = [...new Set(queued.map(({ spec }) => spec))];
    const specs = new Map(await Promise.all(specIds.map(async (id) => [id, await ctx.db.get("specs", id)] as const)));

    const leaseUntil = Date.now() + LEASE_MS;
    for (const { spec, judgments } of batches(queued, specs)) {
      const claim = crypto.randomUUID();
      await Promise.all(
        judgments.map((judgment) =>
          ctx.db.replace("judgments", judgment._id, {
            ...identity(judgment),
            status: "running",
            claim,
            leaseUntil,
            answers: judgment.answers,
          }),
        ),
      );
      await pool.enqueueAction(
        ctx,
        internal.batch.judge,
        {
          spec: spec._id,
          claim,
          questions: spec.questions,
          rows: judgments.map(({ _id, hash, state }) => ({ id: _id, hash, state })),
        },
        {
          onComplete: internal.batch.failed,
          onCompleteExcludeKinds: ["success"],
          context: { claim, ids: judgments.map(({ _id }) => _id) },
        },
      );
    }

    if (queued.length === DISPATCH_LIMIT) await ensureDispatch(ctx, 0);
    return null;
  },
});

function batches(queued: Doc<"judgments">[], specs: Map<Id<"specs">, Doc<"specs"> | null>) {
  const result: Batch[] = [];
  for (const judgment of queued) {
    const spec = specs.get(judgment.spec);
    if (!spec) continue;
    const last = result.at(-1);
    if (last?.spec._id === spec._id && last.judgments.length < spec.batchSize) last.judgments.push(judgment);
    else result.push({ spec, judgments: [judgment] });
  }
  return result;
}

export const judge = internalAction({
  args: {
    spec: v.id("specs"),
    claim: v.string(),
    questions: vQuestions,
    rows: v.array(vRow.extend({ state: vJson })),
  },
  returns: v.null(),
  handler: async (ctx, { spec, claim, questions, rows }) => {
    const jev = new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, baseURL: env.TYPESAFE_BASE_URL });
    const asked = Object.entries(questions);
    const { answers } = await jev.systemOne({
      state: { rows: rows.map(({ state }) => state) },
      questions: Object.fromEntries(
        rows.flatMap((_, i) => asked.map(([name, question]) => [`${name}.${i}`, aboutRow(i, question)])),
      ),
    });
    await ctx.runMutation(internal.batch.record, {
      spec,
      claim,
      results: rows.map(({ id, hash }, i) => ({
        id,
        hash,
        answers: Object.fromEntries(asked.map(([name]) => [name, stored(answers[`${name}.${i}`]!)])),
      })),
    });
    return null;
  },
});

export const record = internalMutation({
  args: { spec: v.id("specs"), claim: v.string(), results: v.array(vRow.extend({ answers: vAnswers })) },
  returns: v.null(),
  handler: async (ctx, { spec: specId, claim, results }) => {
    const spec = await ctx.db.get("specs", specId);
    const byHash = new Map(results.map(({ hash, answers }) => [hash, answers]));
    await Promise.all(
      [...byHash].map(async ([hash, answers]) => {
        const cached = await ctx.db
          .query("cache")
          .withIndex("by_hash", (q) => q.eq("hash", hash))
          .unique();
        if (!cached) await ctx.db.insert("cache", { hash, answers });
      }),
    );
    await Promise.all(
      results.map(async ({ id, answers }) => {
        const judgment = await ctx.db.get("judgments", id);
        if (judgment?.status !== "running" || judgment.claim !== claim) return;
        await ctx.db.replace("judgments", id, { ...identity(judgment), status: "done", answers });
        await settle(ctx, judgment, answers, spec?.onJudged);
      }),
    );
    return null;
  },
});

export const failed = internalMutation({
  args: vOnCompleteArgs(v.object({ claim: v.string(), ids: v.array(v.id("judgments")) })),
  returns: v.null(),
  handler: async (ctx, { context: { claim, ids }, result }) => {
    const error = result.kind === "failed" ? result.error : "canceled";
    await Promise.all(
      ids.map(async (id) => {
        const judgment = await ctx.db.get("judgments", id);
        if (judgment?.status !== "running" || judgment.claim !== claim) return;
        await ctx.db.replace("judgments", id, { ...identity(judgment), status: "failed", error, answers: judgment.answers });
      }),
    );
    return null;
  },
});

export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("judgments")
      .withIndex("by_status_and_leaseUntil", (q) => q.eq("status", "running").lt("leaseUntil", Date.now()))
      .take(DISPATCH_LIMIT);
    await Promise.all(
      expired.map((judgment) =>
        ctx.db.replace("judgments", judgment._id, { ...identity(judgment), status: "queued", answers: judgment.answers }),
      ),
    );
    const waiting = await ctx.db
      .query("judgments")
      .withIndex("by_status_and_spec", (q) => q.eq("status", "queued"))
      .first();
    if (waiting) await ensureDispatch(ctx);
    return null;
  },
});

function aboutRow(i: number, question: Question): JevQuestion {
  const row = `rows[${i}]`;
  const { instructions } = question;
  const scoped =
    instructions === undefined || instructions === null
      ? `Consider the record \`${row}\`.`
      : typeof instructions === "string"
        ? `For the record \`${row}\`: ${instructions}`
        : { record: row, question: instructions };
  return { ...question, instructions: scoped } as JevQuestion;
}

function stored(answer: NoulResponse | ChoiceResponse | ScoreResponse): Answer {
  switch (answer.type) {
    case "noul":
      return { type: "noul", noul: answer.noul };
    case "choice":
      return { type: "choice", choice: answer.choice, confidence: answer.confidence, probabilities: { ...answer.probabilities } };
    case "score":
      return { type: "score", score: answer.score, confidence: answer.confidence, probabilities: { ...answer.probabilities } };
  }
}
