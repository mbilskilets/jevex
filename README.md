# jevex

Ask your Convex tables questions in plain English, and keep the answers in an index.

jevex is a Convex component that turns [TypeSafe's Jev](https://docs.typesafe.ai) into a semantic
index. You declare questions about a table. Every insert and update is judged in the background, the
answers are written back to your database, and your queries read them like any other indexed field.
Reads are reactive and cost nothing extra.

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

Set the key on your deployment with `npx convex env set TYPESAFE_API_KEY <your key>`.
Get one at [console.typesafe.ai](https://console.typesafe.ai).

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

const leaving = await feedbackJudge.top(ctx, "churn", { min: 0.8 });
const bugs = await feedbackJudge.top(ctx, "kind", { label: "bug" });
```

Judging happens on write. Register the index as a
[convex-helpers trigger](https://github.com/get-convex/convex-helpers#triggers) and use the wrapped
`mutation` for writes to that table:

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

Why judge at write time? Convex queries can't call external APIs, because they have to stay
deterministic to be reactive. So jevex judges when a row changes and stores the answer. The model runs
once per change, and every read after that is an index lookup that updates live.

## What it looks like

The repo ships a demo: a customer feedback inbox that sorts itself. Paste a message and watch it move
from the intake belt into Bugs, Requests, Billing, Questions or Praise, with a churn score and a
"might leave" rail on the side.

Numbers from a run against the real Jev API on a local Convex backend:

| What | Result |
| --- | --- |
| One new message, submit to filed on screen | 0.6 to 0.9 s |
| 20 messages sent at once, all filed | about 2 s, in one batched request |
| 25 hand-labelled messages, category correct | 23 of 25 |
| Same 25, churn above or below 0.5 correct | 24 of 25 |
| A message whose text was judged before | filed in the same transaction, no API call |

The two misses were fair. "How do I downgrade to the free plan?" came back as a question, not billing.
"We moved to Notion, please delete our account" came back as a bug because the demo has no
"cancellation" category. Its churn score of 0.64 was still right.

## Use cases

Anything where a human would read a row and make a small call about it. A few that fit well:

### Support and feedback triage

This is the demo. Sort incoming messages by what they mean, rank them by churn risk, and ping the
founder when a paying customer is about to leave.

```ts
export const judged = internalMutation({
  args: vOnJudgedArgs,
  handler: async (ctx, { docId, answers }) => {
    const { churn } = feedbackJudge.answers(answers);
    if (churn.noul >= 0.85) await ctx.scheduler.runAfter(0, internal.slack.alert, { docId });
  },
});
```

### Moderation before publishing

Posts start hidden. They go live once Jev is confident they are not spam or abuse, and the doubtful
ones wait for a person.

```ts
export const postJudge = jevex.index("posts", {
  state: ({ title, body }) => ({ title, body }),
  questions: {
    spam: noul("This post is spam, an ad, or a scam"),
    abusive: noul("This post insults or harasses someone"),
  },
  onJudged: internal.posts.review,
});

const queue = await postJudge.top(ctx, "spam", { min: 0.3, max: 0.7 });
```

### Recruiting pipelines

Rank applicants on the things a CV screen actually checks, and keep the ranking current when a
candidate updates their profile.

```ts
export const candidateJudge = jevex.index("candidates", {
  state: ({ summary, experience }) => ({ summary, experience }),
  questions: {
    shipped: noul("Has shipped a product that real users used"),
    seniority: score("How senior is this person?", ["junior", "mid", "senior", "staff"]),
    track: choice("Which role fits best?", { frontend: null, backend: null, data: null }),
  },
});

const seniorBackend = await candidateJudge.top(ctx, "track", { label: "backend", min: 0.7 });
```

### Marketplace listings

Catch listings that smell like fraud and categorise the rest, without a rules engine that scammers
learn to route around.

```ts
questions: {
  scam: noul("The listing looks like a scam: price far too low, off-platform payment, urgency"),
  category: choice("Which category does this item belong to?", { electronics: null, home: null, fashion: null }),
}
```

### App store and review mining

Reviews that mention a crash become issues. Reviews that compare you to a competitor go to marketing.

```ts
questions: {
  crash: noul("The reviewer reports a crash or the app not opening"),
  competitor: noul("The reviewer compares this app to a named competitor"),
  quotable: noul("This review could be quoted on the website"),
}
```

### Inbound leads

Score form submissions before a salesperson opens them.

```ts
questions: {
  realCompany: noul("This is a real company, not a student project or a test"),
  budget: score("How large does the budget sound?", ["none", "small", "medium", "large"]),
}
```

The pattern is the same every time. A write triggers a judgment, the answer lands in the database, a
reactive query or a callback does something with it.

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

1. A [convex-helpers trigger](https://github.com/get-convex/convex-helpers#triggers) hands every
   insert, update and delete to the component in the same transaction as the write. A delete removes
   the judgment and its answers.
2. The component hashes the questions together with the fields you chose to send. If the hash hasn't
   changed, nothing happens. If that exact content was judged before, the cached answer is applied on
   the spot.
3. Anything new is queued. The dispatcher groups queued rows into requests of up to 20 rows: one
   shared state and one question per row, scoped to `rows[i]`. Accuracy drops when Jev has to find a
   row in a longer array, so 20 is the default.
4. A [workpool](https://www.convex.dev/components/workpool) keeps 16 requests in flight at most. The
   TypeSafe SDK retries rate limits and server errors. Client errors fail the batch straight away.
5. Answers go into an `answers` table indexed by question, label and value. "Churn above 0.8, highest
   first" is an index range read.
6. Every batch carries a claim token. If a row is edited while Jev is reading the old text, the late
   answer is cached and dropped. The edit always wins.
7. Running batches hold a ten minute lease. A cron puts rows back in the queue when their batch
   vanished without reporting back. This happened for real when the local backend restarted mid-batch.

A judgment is always one of four states, so the UI can show each one honestly:

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

- `state` picks what Jev sees. Send only what the judgment needs. It is cheaper, and it keeps the rest
  of the row out of a third-party API.
- Answer types come from your questions. `answers.kind.choice` is typed `"bug" | "feature" | "billing"`,
  and `top` requires a `label` for choice questions.
- `onJudged` is an internal mutation that receives `{ docId, answers }`. It fires on fresh answers and
  on cache hits.
- Index definitions live in your code. Change a question and every row is judged again on its next
  write, because the question hash is part of the cache key.

## Running the example

You need [Bun](https://bun.sh) and a TypeSafe API key from [console.typesafe.ai](https://console.typesafe.ai).

```bash
bun install
bun run link            # registers the package so example/ imports it
bun run build:codegen   # component codegen + build + app codegen
bun run dev             # convex dev for example/convex
bunx convex env set TYPESAFE_API_KEY <your key>
cd example && bun run web
```

`bun run web` serves the board on port 4321 and forwards Convex traffic (`/api/*`, HTTP and websocket)
to the backend, so the whole demo works through one port. That matters behind proxies that forward a
single port.

No key? There is a deterministic stand-in for the API:

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

`@mbilskilets/jevex/test` registers the component with convex-test. It uses a workpool, so register that too:

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

- Row contents leave your database and go to TypeSafe's API. Put only fields you are allowed to share
  into `state`.
- Judgments are eventually consistent with your data. A row is `pending` or `stale` for roughly a
  second after it changes. If a mutation needs the answer before it commits, jevex is the wrong tool.
- The cache grows with every distinct piece of content and has no eviction yet.
- The demo's mutations are public and have no auth, on purpose. Writes that reach Jev are rate limited
  to bursts of 60 and 120 per minute across the deployment.
