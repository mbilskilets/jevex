import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  feedback: defineTable({
    text: v.string(),
    author: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro")),
  }),

  alerts: defineTable({
    feedbackId: v.id("feedback"),
    churn: v.number(),
  }).index("by_feedbackId", ["feedbackId"]),
});
