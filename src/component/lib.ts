import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server.js";
import { canonical, sha256 } from "./hash.js";
import { clearAnswers, ensureDispatch, findJudgment, settle, toJudgment } from "./model.js";
import { vHit, vJudgment, vQuestions, type Questions } from "./validators.js";

const MAX_BATCH_SIZE = 100;
const MAX_HITS = 500;

type SpecInput = { index: string; questions: Questions; batchSize: number; onJudged?: string };

async function upsertSpec(ctx: MutationCtx, { index, questions, batchSize, onJudged }: SpecInput) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new ConvexError(`batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`);
  }
  const hash = await sha256(canonical(questions));
  const spec = await ctx.db
    .query("specs")
    .withIndex("by_index_and_hash", (q) => q.eq("index", index).eq("hash", hash))
    .unique();
  if (!spec) {
    return { _id: await ctx.db.insert("specs", { index, hash, questions, batchSize, onJudged }), hash };
  }
  if (spec.batchSize !== batchSize || spec.onJudged !== onJudged) {
    await ctx.db.patch("specs", spec._id, { batchSize, onJudged });
  }
  return { _id: spec._id, hash };
}

export const judge = mutation({
  args: {
    index: v.string(),
    docId: v.string(),
    state: v.any(),
    questions: vQuestions,
    batchSize: v.number(),
    onJudged: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { docId, state, ...spec }) => {
    const { index, onJudged } = spec;
    const { _id, hash: questionsHash } = await upsertSpec(ctx, spec);
    const hash = await sha256(`${questionsHash}:${canonical(state)}`);
    const existing = await findJudgment(ctx, { index, docId });
    if (existing?.hash === hash && existing.status !== "failed") return null;

    const cached = await ctx.db
      .query("cache")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    const identity = { index, docId, spec: _id, state, hash };
    const judgment = cached
      ? { ...identity, status: "done" as const, answers: cached.answers }
      : { ...identity, status: "queued" as const, answers: existing?.answers };
    if (existing) await ctx.db.replace("judgments", existing._id, judgment);
    else await ctx.db.insert("judgments", judgment);

    if (cached) await settle(ctx, { index, docId }, cached.answers, onJudged);
    else await ensureDispatch(ctx);
    return null;
  },
});

export const forget = mutation({
  args: { index: v.string(), docId: v.string() },
  returns: v.null(),
  handler: async (ctx, key) => {
    const judgment = await findJudgment(ctx, key);
    if (judgment) await ctx.db.delete("judgments", judgment._id);
    await clearAnswers(ctx, key);
    return null;
  },
});

export const get = query({
  args: { index: v.string(), docId: v.string() },
  returns: v.union(vJudgment, v.null()),
  handler: async (ctx, key) => toJudgment(await findJudgment(ctx, key)),
});

export const getMany = query({
  args: { index: v.string(), docIds: v.array(v.string()) },
  returns: v.array(v.union(vJudgment, v.null())),
  handler: async (ctx, { index, docIds }) =>
    Promise.all(docIds.map(async (docId) => toJudgment(await findJudgment(ctx, { index, docId })))),
});

export const top = query({
  args: {
    index: v.string(),
    question: v.string(),
    label: v.optional(v.string()),
    min: v.optional(v.number()),
    max: v.optional(v.number()),
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.number(),
  },
  returns: v.array(vHit),
  handler: async (ctx, { index, question, label, min, max, order = "desc", limit }) => {
    const hits = await ctx.db
      .query("answers")
      .withIndex("by_index_and_question_and_label_and_value", (q) => {
        const answers = q.eq("index", index).eq("question", question).eq("label", label);
        const above = min === undefined ? answers : answers.gte("value", min);
        return max === undefined ? above : above.lte("value", max);
      })
      .order(order)
      .take(Math.min(limit, MAX_HITS));
    return hits.map(({ docId, value, label }) => ({ docId, value, label }));
  },
});
