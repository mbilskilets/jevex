import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "./_generated/dataModel";
import { mutation as rawMutation } from "./_generated/server";
import { feedbackJudge } from "./judges";

const triggers = new Triggers<DataModel>();

triggers.register("feedback", feedbackJudge.trigger());

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
