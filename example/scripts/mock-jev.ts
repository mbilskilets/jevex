type Question = { type: "noul" | "choice" | "score"; criteria?: Record<string, unknown> | unknown[] };
type Request = { state: { rows: unknown[] }; questions: Record<string, Question> };

const port = Number(process.env.PORT ?? 3999);

function roll(seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 2 ** 32;
}

function answer(question: Question, row: string, key: string) {
  const p = roll(`${key}:${row}`);
  if (question.type === "noul") return { type: "noul", noul: p };
  const labels = Array.isArray(question.criteria)
    ? question.criteria.map((_, i) => String(i))
    : Object.keys(question.criteria ?? {});
  const weights = labels.map((label) => roll(`${key}:${label}:${row}`));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const probabilities = Object.fromEntries(labels.map((label, i) => [label, weights[i]! / total]));
  const best = labels[weights.indexOf(Math.max(...weights))]!;
  return question.type === "choice"
    ? { type: "choice", choice: best, confidence: probabilities[best], probabilities }
    : {
        type: "score",
        score: labels.reduce((sum, label) => sum + Number(label) * probabilities[label]!, 0),
        confidence: probabilities[best],
        probabilities,
        legend: {},
      };
}

Bun.serve({
  port,
  async fetch(request) {
    const { state, questions } = (await request.json()) as Request;
    await Bun.sleep(150 + Math.random() * 200);
    const answers = Object.fromEntries(
      Object.entries(questions).map(([key, question]) => {
        const [name, i] = key.split(".") as [string, string];
        return [key, answer(question, JSON.stringify(state.rows[Number(i)]), name)];
      }),
    );
    console.log(`judged ${state.rows.length} rows, ${Object.keys(questions).length} questions`);
    return Response.json({ model: "jev-mock", answers, usage: { input_tokens: 0, output_tokens: 0 } });
  },
});

console.log(`mock jev on http://127.0.0.1:${port}`);
