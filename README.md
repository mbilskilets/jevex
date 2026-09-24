# jevex

A small Convex component that uses [Jev](https://docs.typesafe.ai) to build a semantic index over
your tables.

You write questions about a table in plain English: "is this a bug report?", "is this customer about
to leave?". jevex asks Jev when a row changes and stores the answers in an indexed table. Your
queries then filter and sort by those answers the same way they would by a number column.

```ts
const leaving = await feedbackJudge.top(ctx, "churn", { min: 0.8 });
```

That line never calls a model. It reads an index range, so it's as fast as any other Convex query
and it updates live when a new answer lands.

## Install

```bash
npm install @mbilskilets/jevex
```

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import jevex from "@mbilskilets/jevex/convex.config";

const app = defineApp({
  env: { TYPESAFE_API_KEY: v.string() },
});

app.use(jevex, {
  env: { TYPESAFE_API_KEY: app.env.TYPESAFE_API_KEY },
});

export default app;
```

Set the key with `npx convex env set TYPESAFE_API_KEY <your key>`. You can get one at
[console.typesafe.ai](https://console.typesafe.ai).

### Other providers

Jev is also served by three AI gateways. Pass the matching variable to the component instead of
`TYPESAFE_API_KEY`, and the component picks the provider from whichever key is set:

| Provider | Variable | Model |
| --- | --- | --- |
| [TypeSafe](https://console.typesafe.ai) | `TYPESAFE_API_KEY` | `jev-latest` |
| [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) | `AI_GATEWAY_API_KEY` | `typesafe-ai/jev` |
| [OpenRouter](https://openrouter.ai/docs/guides/community/typesafe-sdk) | `OPENROUTER_API_KEY` | `jev-latest` |
| [Convex AI Gateway](https://docs.convex.dev/ai-gateway/api) | `JEV_PROVIDER=convex`, no key | `typesafe/jev-1.13` |

```ts
const app = defineApp({
  env: { OPENROUTER_API_KEY: v.string() },
});

app.use(jevex, {
  env: { OPENROUTER_API_KEY: app.env.OPENROUTER_API_KEY },
});
```

The Convex AI Gateway needs no key. The component asks your deployment for a short-lived token on
each batch, and the usage shows up on your Convex bill. It only works on cloud deployments that have
the gateway enabled, not on a local backend:

```ts
app.use(jevex, { env: { JEV_PROVIDER: "convex" } });
```

If you pass more than one key, set `JEV_PROVIDER` to `typesafe`, `vercel`, `openrouter` or `convex`
to choose. Without it, batches fail with an error that names the keys it found.

## Define an index

```ts
// convex/judges.ts
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { choice, Jevex, noul, score } from "@mbilskilets/jevex";

const jevex = new Jevex<DataModel>(components.jevex);

export const feedbackJudge = jevex.index("feedback", {
  state: ({ text, plan }) => ({ text, plan }),
  questions: {
    kind: choice("What is this feedback about?", { bug: null, feature: null, billing: null }),
    churn: noul("The user is likely to cancel or is already looking at alternatives"),
    urgency: score("How urgent is this for the business?", ["low", "medium", "high", "critical"]),
  },
  onJudged: internal.feedback.judged,
});
```

Then hook it to writes with a [convex-helpers trigger](https://github.com/get-convex/convex-helpers#triggers)
and use the wrapped `mutation` for that table:

```ts
// convex/functions.ts
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "./_generated/dataModel";
import { mutation as rawMutation } from "./_generated/server";
import { feedbackJudge } from "./judges";

const triggers = new Triggers<DataModel>();
triggers.register("feedback", feedbackJudge.trigger());

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

Now read it:

```ts
const leaving = await feedbackJudge.top(ctx, "churn", { min: 0.8 });
const bugs = await feedbackJudge.top(ctx, "kind", { label: "bug" });
const one = await feedbackJudge.get(ctx, id); // { state: "judged", answers: { kind, churn, urgency } }
```

## Why judge on write

Convex queries can't make network calls. They have to be deterministic so Convex can cache them and
re-run them when data changes. So a query can't ask a model anything.

The usual workaround is an action that calls the model on every read, or a page that loads first and
fills in labels later. Both are slow, and both pay for the same answer over and over.

With jevex the model runs once per change to a row, the answer is stored, and every read after
that is a normal indexed query. Reads outnumber writes by a lot in most apps, so this is where the
cost belongs.

## Why it stays fast

The write path doesn't wait for the model. Your mutation and the trigger run in one transaction, and
the trigger does a few indexed reads, a hash and one insert. No network call happens inside your
transaction, so it stays short and doesn't hold conflicts open while an API responds. jevex adds a
few small reads and writes to your mutation, not a model round trip.

Unrelated writes cost nothing. jevex hashes the questions together with the fields you return from
`state`. If you patch a field Jev doesn't see, like `updatedAt` or `assignee`, the hash doesn't change
and the trigger returns early. If the same content was judged before, anywhere in the table, the
answer comes from the cache in the same transaction.

The model calls are batched. A dispatcher waits 100 ms after the first queued row and packs up to 20
rows into one request, with up to 16 requests in flight. A burst of 300 new rows turns into about 15
API calls, not 300.

Reads are index ranges. Answers live in their own table indexed by
`(index, question, label, value)`. "Churn above 0.8, highest first" or "choice is bug, most confident
first" reads exactly the rows it returns. There's no scan and no post-filter in JavaScript, so it
works the same on 100 rows and on 1M.

Reactivity is narrow. A query over `top("churn", ...)` depends only on the index range it read.
Convex re-runs it when an answer in that range changes, not on every write to your table.

This fits OLTP-style apps: lots of small writes, lots of reads that need to come back in
milliseconds, and a classification you want to filter on without a separate pipeline.

## What it looks like

The repo has a demo, a customer feedback inbox that sorts itself. Paste a message and it moves from
the intake belt into Bugs, Requests, Billing, Questions or Praise, with a churn score and a "might
leave" rail on the side.

I ran it against the real Jev API on a local Convex backend:

| What | Result |
| --- | --- |
| One new message, submit to filed on screen | 0.6 to 0.9 s |
| 20 messages sent at once, all filed | about 2 s, in one batched request |
| 25 hand-labelled messages, category correct | 23 of 25 |
| Same 25, churn above or below 0.5 correct | 24 of 25 |
| A message whose text was judged before | filed in the same transaction, no API call |

The two misses were fair. "How do I downgrade to the free plan?" came back as a question, not
billing. "We moved to Notion, please delete our account" came back as a bug because the demo has no
cancellation category. Its churn score of 0.64 was still right.

## Where it fits

Anywhere a person would read a row and make a small call about it.

Support triage is the demo. Sort messages by what they mean, rank by churn risk, and alert someone
when a paying customer is about to leave:

```ts
export const judged = internalMutation({
  args: vOnJudgedArgs,
  handler: async (ctx, { docId, answers }) => {
    const { churn } = feedbackJudge.answers(answers);
    if (churn.noul >= 0.85) await ctx.scheduler.runAfter(0, internal.slack.alert, { docId });
  },
});
```

Moderation works the same way. Posts start hidden and go live once Jev is confident they aren't spam.
The unsure ones wait for a person:

```ts
export const postJudge = jevex.index("posts", {
  state: ({ title, body }) => ({ title, body }),
  questions: {
    spam: noul("This post is spam, an ad, or a scam"),
    abusive: noul("This post insults or harasses someone"),
  },
  onJudged: internal.posts.review,
});

const unsure = await postJudge.top(ctx, "spam", { min: 0.3, max: 0.7 });
```

Other things that fit: ranking job applicants and keeping the ranking current when they edit their
profile, flagging marketplace listings that look like scams, turning app reviews that mention a crash
into issues, scoring inbound leads before sales opens them.

## How it works

```
 your mutation ──▶ trigger ──▶ jevex.judge ──▶ hash unchanged?  skip
                                    │          cached answer?   settle now
                                    ▼
                               queued rows ──▶ dispatcher (100 ms debounce)
                                                   │  packs up to 20 rows per request
                                                   ▼
                                     workpool (16 in flight) ──▶ Jev API
                                                   │
                                                   ▼
                          record: cache + answers index + your onJudged callback
```

1. The trigger hands every insert, update and delete to the component in the same transaction as
   the write. A delete removes the judgment and its answers.
2. The component hashes the questions and the `state` fields. Same hash, nothing happens. Seen that
   content before, the cached answer is applied right away.
3. Anything new is queued. The dispatcher groups queued rows into requests of up to 20: one shared
   state and one question per row, scoped to `rows[i]`. Jev gets less accurate when it has to find a
   row in a longer array, which is why the default is 20.
4. A [workpool](https://www.convex.dev/components/workpool) keeps at most 16 requests in flight. The
   TypeSafe SDK retries rate limits and server errors. Client errors fail the batch right away.
5. Answers go into the `answers` table and its index.
6. Every batch carries a claim token. If a row is edited while Jev is reading the old text, the late
   answer goes to the cache and is dropped for that row. The edit always wins.
7. Running batches hold a ten minute lease. A cron re-queues rows whose batch disappeared without
   reporting back. I saw this happen when the local backend restarted mid-batch.

A judgment is in one of four states, so the UI can show each one:

| State | Meaning |
| --- | --- |
| `pending` | queued or being read, no answers yet |
| `judged` | answers match the current content |
| `stale` | the row changed, old answers are shown while new ones are on the way |
| `failed` | Jev rejected the batch, old answers are kept if there were any |

## API

```ts
const jevex = new Jevex<DataModel>(components.jevex);

const index = jevex.index("table", {
  state: (doc) => json,
  questions: { name: noul(...) | choice(...) | score(...) },
  onJudged: internal.module.callback,
  batchSize: 20,
});

triggers.register("table", index.trigger());

await index.get(ctx, id);
await index.getMany(ctx, ids);
await index.top(ctx, "question", { label, min, max, order, limit });
await index.judge(ctx, id, doc);
await index.forget(ctx, id);
```

- `state` picks what Jev sees. Send only what the question needs. It's cheaper, it keeps the rest of
  the row out of a third-party API, and it means edits to other fields never trigger a new judgment.
- Answer types come from your questions. `answers.kind.choice` is typed `"bug" | "feature" | "billing"`,
  and `top` requires a `label` for choice questions.
- `onJudged` is an internal mutation that gets `{ docId, answers }`. It fires on fresh answers and on
  cache hits.
- Questions live in your code. Change one and every row is judged again on its next write, because
  the question hash is part of the cache key.

## Running the example

You need [Bun](https://bun.sh) and a key for one of the providers above. The commands below use
TypeSafe. For another provider, set its variable instead.

```bash
bun install
bun run link            # registers the package so example/ imports it
bun run build:codegen   # component codegen + build + app codegen
bun run dev             # convex dev for example/convex
bunx convex env set TYPESAFE_API_KEY <your key>
cd example && bun run web
```

`bun run web` serves the board on port 4321 and forwards Convex traffic (`/api/*`, HTTP and
websocket) to the backend, so the whole demo works through one port.

No key? There's a deterministic stand-in for the API:

```bash
cd example && bun run mock
bunx convex env set TYPESAFE_API_KEY mock
bunx convex env set TYPESAFE_BASE_URL http://127.0.0.1:3999
```

Tests run on convex-test with a fake Jev API, so they never call the real one:

```bash
bun run test
bun run typecheck
```

## Testing your app

`@mbilskilets/jevex/test` registers the component with convex-test. jevex uses a workpool, so
register that too:

```ts
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import jevex from "@mbilskilets/jevex/test";
import schema from "./schema";

const t = convexTest(schema, import.meta.glob("./**/*.ts"));
jevex.register(t);
workpool.register(t, "@mbilskilets/jevex/judges");
```

## Layout

```
src/component/            the component: schema, judge/get/top, batcher, lease cron
src/client/               typed client: Jevex, JevexIndex, choice, noul, score
src/test.ts               convex-test registration helper
src/jevex.test.ts         tests, run against the example app
example/convex/           demo backend: feedback index, triggers, inbox, atRisk, bugs, churn alerts
example/web, serve.ts     the sorting board (Bun.serve and React)
example/scripts/          local stand-in for the Jev API
```

## Things to know

- Row contents leave your database and go to TypeSafe, and through the gateway if you use one. Only
  put fields you're allowed to share into `state`.
- Answers lag your data. A row is `pending` or `stale` for about a second after it changes. If a
  mutation needs the answer before it commits, jevex is the wrong tool.
- The cache grows with every distinct piece of content and has no eviction yet.
- The demo's mutations are public and have no auth, on purpose. Writes that reach Jev are rate
  limited to bursts of 60 and 120 per minute across the deployment.
