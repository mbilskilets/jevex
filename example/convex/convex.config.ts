import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import jevex from "@mbilskilets/jevex/convex.config";

const app = defineApp({
  env: {
    JEV_PROVIDER: v.optional(v.union(v.literal("typesafe"), v.literal("vercel"), v.literal("openrouter"), v.literal("convex"))),
    TYPESAFE_API_KEY: v.optional(v.string()),
    AI_GATEWAY_API_KEY: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
  },
});

app.use(jevex, {
  env: {
    JEV_PROVIDER: app.env.JEV_PROVIDER,
    TYPESAFE_API_KEY: app.env.TYPESAFE_API_KEY,
    AI_GATEWAY_API_KEY: app.env.AI_GATEWAY_API_KEY,
    OPENROUTER_API_KEY: app.env.OPENROUTER_API_KEY,
  },
});

app.use(rateLimiter);

export default app;
