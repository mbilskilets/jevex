import { defineComponent } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";

const component = defineComponent("jevex", {
  env: {
    JEV_PROVIDER: v.optional(v.union(v.literal("typesafe"), v.literal("vercel"), v.literal("openrouter"), v.literal("convex"))),
    TYPESAFE_API_KEY: v.optional(v.string()),
    TYPESAFE_BASE_URL: v.optional(v.string()),
    AI_GATEWAY_API_KEY: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
  },
});

component.use(workpool, { name: "judges" });

export default component;
