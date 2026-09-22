import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { vOnJudgedArgs, type JudgmentOf } from "./components/jevex/client";
import { mutation } from "./functions";
import { feedbackJudge, type FeedbackQuestions } from "./judges";
import schema from "./schema";
import { CHURN_ALERT, kinds, MAX_FEEDBACK_LENGTH, type Kind } from "./triage";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  judgedWrites: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
});

const vFeedback = schema.doc("feedback");
const vKind = v.union(...(Object.keys(kinds) as Kind[]).map((kind) => v.literal(kind)));
const vReading = v.object({
  kind: vKind,
  probabilities: v.record(v.string(), v.number()),
  churn: v.number(),
  urgency: v.number(),
  quotable: v.number(),
});
const vInboxItem = vFeedback.extend({
  state: v.union(v.literal("pending"), v.literal("judged"), v.literal("stale"), v.literal("failed")),
  reading: v.union(vReading, v.null()),
});

function clean(text: string) {
  const body = text.trim();
  if (body.length === 0 || body.length > MAX_FEEDBACK_LENGTH) {
    throw new ConvexError(`Feedback needs between 1 and ${MAX_FEEDBACK_LENGTH} characters.`);
  }
  return body;
}

function toInboxItem(feedback: Doc<"feedback">, judgment: JudgmentOf<FeedbackQuestions> | null) {
  const answers = judgment && "answers" in judgment ? judgment.answers : undefined;
  return {
    ...feedback,
    state: judgment?.state ?? "pending",
    reading: answers
      ? {
          kind: answers.kind.choice,
          probabilities: { ...answers.kind.probabilities },
          churn: answers.churn.noul,
          urgency: answers.urgency.score,
          quotable: answers.quotable.noul,
        }
      : null,
  };
}

export const submit = mutation({
  args: { text: v.string(), author: v.string(), plan: vFeedback.fields.plan },
  returns: v.id("feedback"),
  handler: async (ctx, { text, author, plan }) => {
    await rateLimiter.limit(ctx, "judgedWrites", { throws: true });
    return ctx.db.insert("feedback", { text: clean(text), author: author.trim().slice(0, 40) || "anonymous", plan });
  },
});

export const edit = mutation({
  args: { id: v.id("feedback"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, text }) => {
    await rateLimiter.limit(ctx, "judgedWrites", { throws: true });
    await ctx.db.patch("feedback", id, { text: clean(text) });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("feedback") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete("feedback", id);
    return null;
  },
});

export const inbox = query({
  args: {},
  returns: v.array(vInboxItem),
  handler: async (ctx) => {
    const feedback = await ctx.db.query("feedback").order("desc").take(50);
    const judgments = await feedbackJudge.getMany(ctx, feedback.map(({ _id }) => _id));
    return feedback.map((item, i) => toInboxItem(item, judgments[i] ?? null));
  },
});

export const atRisk = query({
  args: {},
  returns: v.array(vFeedback.extend({ churn: v.number(), alerted: v.boolean() })),
  handler: async (ctx) => {
    const hits = await feedbackJudge.top(ctx, "churn", { min: 0.5, limit: 20 });
    const rows = await Promise.all(
      hits.map(async ({ id, value }) => {
        const [feedback, alert] = await Promise.all([
          ctx.db.get("feedback", id),
          ctx.db
            .query("alerts")
            .withIndex("by_feedbackId", (q) => q.eq("feedbackId", id))
            .unique(),
        ]);
        return feedback && { ...feedback, churn: value, alerted: alert !== null };
      }),
    );
    return rows.filter((row) => row !== null);
  },
});

export const bugs = query({
  args: {},
  returns: v.array(vFeedback),
  handler: async (ctx) => {
    const hits = await feedbackJudge.top(ctx, "kind", { label: "bug", limit: 20 });
    const feedback = await Promise.all(hits.map(({ id }) => ctx.db.get("feedback", id)));
    return feedback.filter((item) => item !== null);
  },
});

export const judged = internalMutation({
  args: vOnJudgedArgs,
  returns: v.null(),
  handler: async (ctx, { docId, answers }) => {
    const { churn } = feedbackJudge.answers(answers);
    if (churn.noul < CHURN_ALERT) return null;

    const id = ctx.db.normalizeId("feedback", docId);
    const feedback = id && (await ctx.db.get("feedback", id));
    if (feedback?.plan !== "pro") return null;

    const alert = await ctx.db
      .query("alerts")
      .withIndex("by_feedbackId", (q) => q.eq("feedbackId", feedback._id))
      .unique();
    if (!alert) await ctx.db.insert("alerts", { feedbackId: feedback._id, churn: churn.noul });
    return null;
  },
});
