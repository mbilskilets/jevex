import { TypeSafeClient } from "@typesafe-ai/sdk";
import { getServiceToken } from "convex/server";
import { env } from "./_generated/server.js";

type Provider = "typesafe" | "vercel" | "openrouter" | "convex";

const keys = {
  typesafe: "TYPESAFE_API_KEY",
  vercel: "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
} as const;

const CONVEX_DECISIONS_URL = "https://ai-gateway.convex.dev/alpha/decisions";

function provider(): Provider {
  if (env.JEV_PROVIDER) return env.JEV_PROVIDER;
  const configured = (Object.keys(keys) as (keyof typeof keys)[]).filter((name) => env[keys[name]]);
  const [only, ...others] = configured;
  if (only && others.length === 0) return only;
  if (!only) {
    throw new Error("No Jev provider configured: set TYPESAFE_API_KEY, AI_GATEWAY_API_KEY or OPENROUTER_API_KEY, or JEV_PROVIDER=convex");
  }
  throw new Error(`Several Jev keys are set (${configured.map((name) => keys[name]).join(", ")}): pick one with JEV_PROVIDER`);
}

export async function client(): Promise<TypeSafeClient> {
  const name = provider();
  const baseURL = env.TYPESAFE_BASE_URL;
  switch (name) {
    case "typesafe":
      return new TypeSafeClient({ apiKey: key(name), baseURL });
    case "vercel":
      return new TypeSafeClient({
        apiKey: key(name),
        baseURL: baseURL ?? "https://ai-gateway.vercel.sh/typesafe",
        defaultModel: "typesafe-ai/jev",
      });
    case "openrouter":
      return new TypeSafeClient({ apiKey: key(name), baseURL: baseURL ?? "https://openrouter.ai/api" });
    case "convex":
      return new TypeSafeClient({
        apiKey: await getServiceToken("ai-gateway"),
        defaultModel: "typesafe/jev-1.13",
        fetch: (_url, init) => fetch(CONVEX_DECISIONS_URL, init),
      });
  }
}

function key(name: keyof typeof keys) {
  const value = env[keys[name]];
  if (!value) throw new Error(`JEV_PROVIDER is ${name} but ${keys[name]} is not set`);
  return value;
}
