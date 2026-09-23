import { v, type Infer } from "convex/values";

export const vJson = v.any();

export const vQuestion = v.union(
  v.object({
    type: v.literal("noul"),
    instructions: v.optional(vJson),
    criteria: v.optional(
      v.union(
        v.null(),
        v.object({ true: v.optional(vJson), false: v.optional(vJson) }),
      ),
    ),
  }),
  v.object({
    type: v.literal("choice"),
    instructions: v.optional(vJson),
    criteria: v.record(v.string(), vJson),
  }),
  v.object({
    type: v.literal("score"),
    instructions: v.optional(vJson),
    criteria: v.array(vJson),
  }),
);

export const vQuestions = v.record(v.string(), vQuestion);

export const vAnswer = v.union(
  v.object({ type: v.literal("noul"), noul: v.number() }),
  v.object({
    type: v.literal("choice"),
    choice: v.string(),
    confidence: v.number(),
    probabilities: v.record(v.string(), v.number()),
  }),
  v.object({
    type: v.literal("score"),
    score: v.number(),
    confidence: v.number(),
    probabilities: v.record(v.string(), v.number()),
  }),
);

export const vAnswers = v.record(v.string(), vAnswer);

export const vStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);

export const vJudgment = v.union(
  v.object({ state: v.literal("pending") }),
  v.object({ state: v.literal("judged"), answers: vAnswers }),
  v.object({ state: v.literal("stale"), answers: vAnswers }),
  v.object({ state: v.literal("failed"), error: v.string(), answers: v.optional(vAnswers) }),
);

export const vHit = v.object({
  docId: v.string(),
  value: v.number(),
  label: v.optional(v.string()),
});

export type Question = Infer<typeof vQuestion>;
export type Questions = Infer<typeof vQuestions>;
export type Answer = Infer<typeof vAnswer>;
export type Answers = Infer<typeof vAnswers>;
export type Judgment = Infer<typeof vJudgment>;
