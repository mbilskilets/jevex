import type { FunctionHandle } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Answer, Answers, Judgment } from "./validators";

const FLUSH_AFTER_MS = 100;
const DISPATCH_GRACE_MS = 60 * 1000;

export type DocKey = { index: string; docId: string };

export function findJudgment(ctx: QueryCtx, { index, docId }: DocKey) {
  return ctx.db
    .query("judgments")
    .withIndex("by_index_and_docId", (q) => q.eq("index", index).eq("docId", docId))
    .unique();
}

export function identity({ index, docId, spec, state, hash }: Doc<"judgments">) {
  return { index, docId, spec, state, hash };
}

export async function ensureDispatch(ctx: MutationCtx, delayMs = FLUSH_AFTER_MS) {
  const dispatcher = await ctx.db.query("dispatcher").first();
  const now = Date.now();
  if (dispatcher?.scheduledAt !== undefined && dispatcher.scheduledAt > now - DISPATCH_GRACE_MS) return;
  await ctx.scheduler.runAfter(delayMs, internal.batch.dispatch, {});
  const scheduledAt = now + delayMs;
  if (dispatcher) await ctx.db.patch("dispatcher", dispatcher._id, { scheduledAt });
  else await ctx.db.insert("dispatcher", { scheduledAt });
}

function answerRows(ctx: QueryCtx, { index, docId }: DocKey) {
  return ctx.db
    .query("answers")
    .withIndex("by_index_and_docId", (q) => q.eq("index", index).eq("docId", docId))
    .collect();
}

export async function clearAnswers(ctx: MutationCtx, key: DocKey) {
  const rows = await answerRows(ctx, key);
  await Promise.all(rows.map(({ _id }) => ctx.db.delete("answers", _id)));
}

export async function settle(ctx: MutationCtx, { index, docId }: DocKey, answers: Answers, onJudged?: string) {
  const rows = await answerRows(ctx, { index, docId });
  await Promise.all([
    ...Object.entries(answers).map(([question, answer]) => {
      const entry = indexEntry(answer);
      const row = rows.find((row) => row.question === question);
      if (!row) return ctx.db.insert("answers", { index, docId, question, ...entry });
      if (row.value !== entry.value || row.label !== entry.label) return ctx.db.patch("answers", row._id, entry);
    }),
    ...rows.filter(({ question }) => !(question in answers)).map(({ _id }) => ctx.db.delete("answers", _id)),
  ]);
  if (onJudged) {
    await ctx.scheduler.runAfter(0, onJudged as FunctionHandle<"mutation">, { docId, answers });
  }
}

function indexEntry(answer: Answer) {
  switch (answer.type) {
    case "noul":
      return { value: answer.noul, label: undefined };
    case "score":
      return { value: answer.score, label: undefined };
    case "choice":
      return { value: answer.confidence, label: answer.choice };
  }
}

export function toJudgment(judgment: Doc<"judgments"> | null): Judgment | null {
  if (!judgment) return null;
  switch (judgment.status) {
    case "done":
      return { state: "judged", answers: judgment.answers };
    case "failed":
      return { state: "failed", error: judgment.error, answers: judgment.answers };
    case "queued":
    case "running":
      return judgment.answers ? { state: "stale", answers: judgment.answers } : { state: "pending" };
  }
}
