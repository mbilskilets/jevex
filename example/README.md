# jevex example: a feedback board

A small app that shows jevex working on a `feedback` table. Send a message and it lands "on the belt"
while Jev reads it. It is then filed by kind (bug, request, billing, question, praise), scored for
urgency, and listed under "Might leave" if the sender looks likely to cancel. Edit a card and it is
read again.

What each part shows:

| File | jevex feature |
| --- | --- |
| `convex/judges.ts` | `jevex.index` with a `choice`, a `score` and two `noul` questions |
| `convex/functions.ts` | the convex-helpers trigger that judges rows on write |
| `convex/feedback.ts` | `getMany` for the inbox, `top` for the churn and bug lists, `onJudged` for founder alerts |
| `convex/convex.config.ts` | passing provider keys to the component |
| `web/app.tsx` | the React board, live through `useQuery` |

## Run it

You need [Bun](https://bun.sh) and a key for one of the
[supported providers](../README.md#other-providers). From the repository root:

```bash
bun install
bun run link            # registers the package so example/ imports it
bun run build:codegen   # component codegen + build + app codegen
bun run dev             # convex dev for example/convex, leave it running
```

In a second terminal:

```bash
bunx convex env set TYPESAFE_API_KEY <your key>
cd example && bun run web
```

Open http://localhost:4321. "Send 20 messages at once" fills the board with sample feedback.

Writes are rate limited to 120 a minute, so a shared deployment can't run up a large Jev bill.
