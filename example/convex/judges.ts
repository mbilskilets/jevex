import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { choice, Jevex, noul, score, type JevexIndex } from "@mbilskilets/jevex";
import { kinds, urgencies } from "./triage";

const jevex = new Jevex<DataModel>(components.jevex);

const feedbackQuestions = {
  kind: choice("What is this feedback about?", kinds),
  churn: noul("The user is likely to cancel or is already looking at alternatives"),
  urgency: score("How urgent is this for the business?", urgencies),
  quotable: noul("This could be used as a public testimonial"),
};

export const feedbackJudge: JevexIndex<DataModel, "feedback", typeof feedbackQuestions> =
  jevex.index("feedback", {
    state: ({ text, plan }) => ({ text, plan }),
    questions: feedbackQuestions,
    onJudged: internal.feedback.judged,
  });

export type FeedbackQuestions = typeof feedbackQuestions;
