import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vAnswers, vJson, vQuestions } from "./validators.js";

const judgment = {
  index: v.string(),
  docId: v.string(),
  spec: v.id("specs"),
  state: vJson,
  hash: v.string(),
};

export default defineSchema({
  specs: defineTable({
    index: v.string(),
    hash: v.string(),
    questions: vQuestions,
    batchSize: v.number(),
    onJudged: v.optional(v.string()),
  }).index("by_index_and_hash", ["index", "hash"]),

  judgments: defineTable(
    v.union(
      v.object({ ...judgment, status: v.literal("queued"), answers: v.optional(vAnswers) }),
      v.object({
        ...judgment,
        status: v.literal("running"),
        claim: v.string(),
        leaseUntil: v.number(),
        answers: v.optional(vAnswers),
      }),
      v.object({ ...judgment, status: v.literal("done"), answers: vAnswers }),
      v.object({ ...judgment, status: v.literal("failed"), error: v.string(), answers: v.optional(vAnswers) }),
    ),
  )
    .index("by_index_and_docId", ["index", "docId"])
    .index("by_status_and_spec", ["status", "spec"])
    .index("by_status_and_leaseUntil", ["status", "leaseUntil"]),

  answers: defineTable({
    index: v.string(),
    question: v.string(),
    docId: v.string(),
    value: v.number(),
    label: v.optional(v.string()),
  })
    .index("by_index_and_docId", ["index", "docId"])
    .index("by_index_and_question_and_label_and_value", ["index", "question", "label", "value"]),

  cache: defineTable({
    hash: v.string(),
    answers: vAnswers,
  }).index("by_hash", ["hash"]),

  dispatcher: defineTable({
    scheduledAt: v.optional(v.number()),
  }),
});
