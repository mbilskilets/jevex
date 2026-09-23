import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import jevex from "@mbilskilets/jevex/convex.config";

const app = defineApp({
  env: {
    TYPESAFE_API_KEY: v.string(),
    TYPESAFE_BASE_URL: v.optional(v.string()),
  },
});

app.use(jevex, {
  env: {
    TYPESAFE_API_KEY: app.env.TYPESAFE_API_KEY,
    TYPESAFE_BASE_URL: app.env.TYPESAFE_BASE_URL,
  },
});

app.use(rateLimiter);

export default app;
