/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, components } from "../example/convex/_generated/api.js";
import schema from "../example/convex/schema.js";
import jevex from "./test.js";

vi.mock("convex/server", async (original) => ({
  ...(await original<typeof import("convex/server")>()),
  getServiceToken: async () => "convex-service-token",
}));

type Request = {
  url: string;
  auth: string | null;
  model: string;
  state: { rows: { text: string }[] };
  questions: Record<string, { type: "noul" | "choice" | "score"; instructions: string }>;
};

const calls: Request[] = [];

function answer(type: string, name: string, text: string) {
  if (type === "noul") {
    const yes = name === "churn" ? /cancel|alternative/i.test(text) : /love/i.test(text);
    return { type, noul: yes ? 0.93 : 0.04 };
  }
  if (type === "choice") {
    const choice = /broken|crash/i.test(text) ? "bug" : /love/i.test(text) ? "praise" : "feature";
    return {
      type,
      choice,
      confidence: 0.6,
      probabilities: { bug: 0.1, feature: 0.1, praise: 0.1, billing: 0.1, question: 0.1, [choice]: 0.6 },
    };
  }
  return { type, score: 2.4, confidence: 0.7, probabilities: { 0: 0.1, 1: 0.1, 2: 0.3, 3: 0.5 }, legend: {} };
}

function jev(status = 200) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const request = {
      ...(JSON.parse(String(init?.body)) as Request),
      url: String(url),
      auth: new Headers(init?.headers).get("authorization"),
    };
    calls.push(request);
    if (status !== 200) return new Response("nope", { status });
    const answers = Object.fromEntries(
      Object.entries(request.questions).map(([key, { type }]) => {
        const [name, i] = key.split(".") as [string, string];
        return [key, answer(type, name, request.state.rows[Number(i)]!.text)];
      }),
    );
    return Response.json({ model: "jev-test", answers, usage: { input_tokens: 1, output_tokens: 1 } });
  });
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

function setup() {
  const t = convexTest(schema, import.meta.glob("../example/convex/**/*.ts"));
  jevex.register(t);
  workpool.register(t, "jevex/judges");
  rateLimiter.register(t);
  return t;
}

async function drain(t: ReturnType<typeof setup>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function inboxItem(t: ReturnType<typeof setup>) {
  return (await t.query(api.feedback.inbox, {}))[0]!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubGlobal("fetch", jev());
  calls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("judges new feedback and indexes the answers", async () => {
  const t = setup();
  const id = await t.mutation(api.feedback.submit, {
    text: "Export is broken again, I'm looking at alternatives",
    author: "ana",
    plan: "pro",
  });

  expect(await inboxItem(t)).toMatchObject({ state: "pending", reading: null });
  await drain(t);

  expect(await inboxItem(t)).toMatchObject({
    state: "judged",
    reading: { kind: "bug", churn: 0.93, urgency: 2.4 },
  });
  expect(await t.query(api.feedback.atRisk, {})).toMatchObject([{ _id: id, churn: 0.93, alerted: true }]);
  expect(await t.query(api.feedback.bugs, {})).toMatchObject([{ _id: id }]);

  const alerts = await t.run((ctx) => ctx.db.query("alerts").collect());
  expect(alerts).toMatchObject([{ feedbackId: id, churn: 0.93 }]);
});

test("packs rows into batches of twenty and scopes each question to its row", async () => {
  const t = setup();
  for (let i = 0; i < 25; i++) {
    await t.mutation(api.feedback.submit, { text: `idea #${i}`, author: "bo", plan: "free" });
  }
  await drain(t);

  expect(calls.map(({ state }) => state.rows.length).sort()).toEqual([20, 5]);
  expect(Object.keys(calls[0]!.questions)).toHaveLength(20 * 4);
  expect(calls[0]!.questions["churn.3"]!.instructions).toMatch(/^For the record `rows\[3\]`: /);
  const inbox = await t.query(api.feedback.inbox, {});
  expect(inbox.every(({ state }) => state === "judged")).toBe(true);
});

test("re-judges only when the judged fields change, and reuses the cache", async () => {
  const t = setup();
  const id = await t.mutation(api.feedback.submit, { text: "I love it", author: "cy", plan: "free" });
  await drain(t);
  expect(calls).toHaveLength(1);

  await t.run((ctx) => ctx.db.patch("feedback", id, { author: "cyrus" }));
  await t.mutation(api.feedback.edit, { id, text: "I love it" });
  await drain(t);
  expect(calls).toHaveLength(1);

  await t.mutation(api.feedback.edit, { id, text: "Crash on login, going to cancel" });
  expect(await inboxItem(t)).toMatchObject({ state: "stale", reading: { kind: "praise" } });
  await drain(t);
  expect(calls).toHaveLength(2);
  expect(await inboxItem(t)).toMatchObject({ state: "judged", reading: { kind: "bug", churn: 0.93 } });

  await t.mutation(api.feedback.edit, { id, text: "I love it" });
  expect(await inboxItem(t)).toMatchObject({ state: "judged", reading: { kind: "praise" } });
  await drain(t);
  expect(calls).toHaveLength(2);
});

test("drops an answer for content that changed while it was being judged", async () => {
  const gates = new Map([
    ["I love it", gate()],
    ["Totally broken", gate()],
  ]);
  const started = new Set<string>();
  const answerWith = jev();
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const text = (JSON.parse(String(init?.body)) as Request).state.rows[0]!.text;
    started.add(text);
    await gates.get(text)?.opened;
    return answerWith(url, init);
  });

  const t = setup();
  const id = await t.mutation(api.feedback.submit, { text: "I love it", author: "di", plan: "free" });
  const running = drain(t);
  await vi.waitUntil(() => started.has("I love it"));

  await t.mutation(api.feedback.edit, { id, text: "Totally broken" });
  gates.get("I love it")!.open();
  await vi.waitUntil(() => started.has("Totally broken"));

  expect(await inboxItem(t)).toMatchObject({ state: "pending", reading: null });
  expect(await t.query(api.feedback.bugs, {})).toEqual([]);

  gates.get("Totally broken")!.open();
  await running;
  await drain(t);

  expect(await inboxItem(t)).toMatchObject({ state: "judged", reading: { kind: "bug" } });
  expect(await t.query(api.feedback.bugs, {})).toMatchObject([{ _id: id }]);
});

test("requeues rows whose lease expired without an answer", async () => {
  const t = setup();
  const batch = (components.jevex as unknown as {
    batch: Record<"dispatch" | "recover", FunctionReference<"mutation", "internal">>;
  }).batch;
  const id = await t.mutation(api.feedback.submit, { text: "Totally broken", author: "go", plan: "free" });
  await t.mutation(batch.dispatch, {});

  await t.mutation(batch.recover, {});
  await drain(t);
  expect(calls).toHaveLength(1);

  await t.mutation(api.feedback.edit, { id, text: "Crashed" });
  await t.mutation(batch.dispatch, {});
  vi.setSystemTime(Date.now() + 11 * 60 * 1000);
  await t.mutation(batch.recover, {});
  await drain(t);
  expect(calls.map(({ state }) => state.rows[0]!.text)).toEqual(["Totally broken", "Crashed", "Crashed"]);
  expect(await inboxItem(t)).toMatchObject({ state: "judged", reading: { kind: "bug" } });
});

test("keeps batch size and callbacks separate for indexes that ask the same questions", async () => {
  const t = setup();
  const questions = { churn: { type: "noul" as const, instructions: "Will they leave?" } };
  for (const [index, batchSize] of [["a", 1], ["b", 5]] as const) {
    for (let i = 0; i < 3; i++) {
      await t.mutation(components.jevex.lib.judge, {
        index,
        docId: `${index}${i}`,
        state: { text: `${index} row ${i}` },
        questions,
        batchSize,
      });
    }
  }
  await drain(t);

  expect(calls.map(({ state }) => state.rows.length).sort()).toEqual([1, 1, 1, 3]);
});

test("rejects a batch size Jev cannot handle", async () => {
  const t = setup();
  await expect(
    t.mutation(components.jevex.lib.judge, { index: "a", docId: "x", state: {}, questions: {}, batchSize: 0 }),
  ).rejects.toThrow(/batchSize/);
});

test("forgets deleted rows", async () => {
  const t = setup();
  const id = await t.mutation(api.feedback.submit, { text: "Totally broken", author: "ed", plan: "free" });
  await drain(t);
  await t.mutation(api.feedback.remove, { id });

  expect(await t.query(api.feedback.bugs, {})).toEqual([]);
  expect(await t.query(api.feedback.inbox, {})).toEqual([]);
});

test("marks the batch failed when Jev rejects it", async () => {
  vi.stubGlobal("fetch", jev(400));
  const t = setup();
  await t.mutation(api.feedback.submit, { text: "hello", author: "fa", plan: "free" });
  await drain(t);

  expect(calls).toHaveLength(1);
  expect(await inboxItem(t)).toMatchObject({ state: "failed", reading: null });
});

test.each([
  ["typesafe", "TYPESAFE_API_KEY", "https://api.typesafe.ai/v1/systemone", "jev-latest"],
  ["vercel", "AI_GATEWAY_API_KEY", "https://ai-gateway.vercel.sh/typesafe/v1/systemone", "typesafe-ai/jev"],
  ["openrouter", "OPENROUTER_API_KEY", "https://openrouter.ai/api/v1/systemone", "jev-latest"],
])("picks %s from the key that is set", async (_provider, key, url, model) => {
  vi.stubEnv("TYPESAFE_API_KEY", undefined);
  vi.stubEnv(key, "picked-key");
  const t = setup();
  await t.mutation(api.feedback.submit, { text: "Totally broken", author: "ha", plan: "free" });
  await drain(t);

  expect(calls).toMatchObject([{ url, model, auth: "Bearer picked-key" }]);
  expect(await inboxItem(t)).toMatchObject({ state: "judged", reading: { kind: "bug" } });
});

test("calls the Convex AI Gateway with a deployment token", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", undefined);
  vi.stubEnv("JEV_PROVIDER", "convex");
  const t = setup();
  await t.mutation(api.feedback.submit, { text: "Totally broken", author: "ia", plan: "free" });
  await drain(t);

  expect(calls).toMatchObject([
    { url: "https://ai-gateway.convex.dev/alpha/decisions", model: "typesafe/jev-1.13", auth: "Bearer convex-service-token" },
  ]);
  expect(await inboxItem(t)).toMatchObject({ state: "judged", reading: { kind: "bug" } });
});

test("fails the batch when several keys are set and no provider is picked", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "second-key");
  const t = setup();
  const id = await t.mutation(api.feedback.submit, { text: "hello", author: "ja", plan: "free" });
  await drain(t);

  expect(calls).toHaveLength(0);
  expect(await t.query(components.jevex.lib.get, { index: "feedback", docId: id })).toMatchObject({
    state: "failed",
    error: expect.stringMatching(/TYPESAFE_API_KEY, OPENROUTER_API_KEY.*JEV_PROVIDER/),
  });
});
