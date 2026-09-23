import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { StrictMode, useState, type CSSProperties, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import { kinds, MAX_FEEDBACK_LENGTH, urgencies, type Kind } from "../convex/triage";
import { pick, samples } from "./samples";

const convex = new ConvexReactClient(location.origin);

const shelves: Record<Kind, string> = {
  bug: "Bugs",
  feature: "Requests",
  billing: "Billing",
  question: "Questions",
  praise: "Praise",
};

const order = Object.keys(kinds) as Kind[];

type Item = FunctionReturnType<typeof api.feedback.inbox>[number];
type Reading = NonNullable<Item["reading"]>;
type Plan = Item["plan"];

const percent = (value: number) => `${Math.round(value * 100)}%`;

function App() {
  const inbox = useQuery(api.feedback.inbox, {});
  const atRisk = useQuery(api.feedback.atRisk, {});
  const items = inbox ?? [];
  const intake = items.filter(({ reading }) => !reading);
  const judged = items.length - intake.length;

  return (
    <div className="office">
      <header className="masthead">
        <div>
          <p className="eyebrow">jevex · Convex × Jev</p>
          <h1>
            Feedback that <em>sorts itself.</em>
          </h1>
          <p className="lede">
            Every message is read by Jev the moment it lands, filed by what it means, and scored for how likely the
            sender is to leave. Nothing here is keyword matching.
          </p>
        </div>
        <dl className="tally">
          <div>
            <dt>Filed</dt>
            <dd>{judged}</dd>
          </div>
          <div>
            <dt>Being read</dt>
            <dd>{intake.length}</dd>
          </div>
          <div className="hot">
            <dt>Might leave</dt>
            <dd>{atRisk?.length ?? 0}</dd>
          </div>
        </dl>
      </header>

      <section className="desk">
        <Composer />
        <Intake items={intake} />
      </section>

      <main className="floor">
        <div className="cubbies">
          {order.map((kind) => {
            const cards = items.filter(({ reading }) => reading?.kind === kind);
            return (
              <section key={kind} className="cubby" data-kind={kind} aria-label={shelves[kind]}>
                <header className="plate">
                  <h2>{shelves[kind]}</h2>
                  <span className="count">{String(cards.length).padStart(2, "0")}</span>
                </header>
                <div className="slot">
                  {cards.length === 0 ? (
                    <p className="empty">Nothing filed yet.</p>
                  ) : (
                    cards.map((item) => <Card key={item._id} item={item} reading={item.reading!} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="watch">
          <header className="plate">
            <h2>Might leave</h2>
            <span className="count">churn ≥ 50%</span>
          </header>
          {atRisk === undefined || atRisk.length === 0 ? (
            <p className="empty">No one is on their way out. Try “we're moving to Linear”.</p>
          ) : (
            <ol className="risk">
              {atRisk.map((row) => (
                <li key={row._id} style={{ "--heat": row.churn } as CSSProperties}>
                  <span className="risk-p">{percent(row.churn)}</span>
                  <span className="risk-text">{row.text}</span>
                  <span className="risk-meta">
                    {row.plan}
                    {row.alerted && <b> · founder alerted</b>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>
    </div>
  );
}

function Composer() {
  const submit = useMutation(api.feedback.submit);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan>("pro");
  const [flooding, setFlooding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await submit({ text, plan, author: "you" });
      setText("");
    } catch {
      setError(`Write between 1 and ${MAX_FEEDBACK_LENGTH} characters, then send again. Sending too fast also pauses the inbox for a moment.`);
    }
  }

  async function flood() {
    setFlooding(true);
    try {
      await Promise.all(
        pick(20).map((sample, i) => submit({ text: sample, plan: i % 3 ? "free" : "pro", author: `customer ${i + 1}` })),
      );
    } catch {
      setError("Some messages were not sent because the inbox is rate limited. Wait a minute and try again.");
    } finally {
      setFlooding(false);
    }
  }

  return (
    <form className="composer" onSubmit={send}>
      <label htmlFor="message">New feedback</label>
      <textarea
        id="message"
        value={text}
        maxLength={MAX_FEEDBACK_LENGTH}
        rows={3}
        placeholder="The export broke again and my client is waiting…"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send(event);
        }}
      />
      <div className="controls">
        <div className="plan" role="radiogroup" aria-label="Customer plan">
          {(["free", "pro"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={plan === option}
              onClick={() => setPlan(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <button type="button" className="ghost" onClick={() => setText(samples[Math.floor(Math.random() * samples.length)]!)}>
          Use an example
        </button>
        <button type="submit" className="send" disabled={text.trim().length === 0}>
          Send feedback
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="flood" onClick={flood} disabled={flooding}>
        {flooding ? "Sending 20 messages…" : "Send 20 messages at once"}
      </button>
    </form>
  );
}

function Intake({ items }: { items: Item[] }) {
  return (
    <section className="intake" aria-label="Being read">
      <header className="plate">
        <h2>On the belt</h2>
        <span className="count">{items.length === 0 ? "clear" : `${items.length} being read`}</span>
      </header>
      {items.length === 0 ? (
        <p className="empty">New messages wait here while Jev reads them.</p>
      ) : (
        <ul className="belt">
          {items.map((item) => (
            <li key={item._id} className={item.state === "failed" ? "stuck" : "reading"}>
              <p>{item.text}</p>
              <span>{item.state === "failed" ? "Jev couldn't read this one" : "Jev is reading"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Card({ item, reading }: { item: Item; reading: Reading }) {
  const edit = useMutation(api.feedback.edit);
  const remove = useMutation(api.feedback.remove);
  const [draft, setDraft] = useState<string | null>(null);
  const urgency = urgencies[Math.min(urgencies.length - 1, Math.max(0, Math.round(reading.urgency)))]!;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (draft === null) return;
    await edit({ id: item._id, text: draft });
    setDraft(null);
  }

  return (
    <article className="card" data-state={item.state} style={{ "--heat": reading.churn } as CSSProperties}>
      <div className="strip" aria-label="How sure Jev is about the category">
        {order.map((kind) => (
          <span
            key={kind}
            data-kind={kind}
            style={{ flexGrow: reading.probabilities[kind] ?? 0 }}
            title={`${shelves[kind]} ${percent(reading.probabilities[kind] ?? 0)}`}
          />
        ))}
      </div>

      {draft === null ? (
        <p className="text" onDoubleClick={() => setDraft(item.text)}>
          {reading.quotable > 0.8 && <span className="quote" aria-label="Quotable">“</span>}
          {item.text}
        </p>
      ) : (
        <form onSubmit={save} className="edit">
          <textarea value={draft} autoFocus rows={3} maxLength={MAX_FEEDBACK_LENGTH} onChange={(event) => setDraft(event.target.value)} />
          <div>
            <button type="submit">Save and re-read</button>
            <button type="button" className="ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <footer>
        <span className={`plan-tag ${item.plan}`}>{item.plan}</span>
        <span className={`urgency u-${urgency}`}>{urgency}</span>
        <span className="churn">leave {percent(reading.churn)}</span>
        {item.state === "stale" && <span className="rereading">re-reading</span>}
        {item.state === "failed" && <span className="unread">couldn't re-read</span>}
        <span className="actions">
          <button type="button" onClick={() => setDraft(item.text)} aria-label="Edit">
            edit
          </button>
          <button type="button" onClick={() => remove({ id: item._id })} aria-label="Delete">
            ×
          </button>
        </span>
      </footer>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
);
