import type { ChoiceQuestion, NoulQuestion, ResultFor, ScoreQuestion } from "@typesafe-ai/sdk";
import {
  createFunctionHandle,
  type DocumentByName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  type GenericDataModel,
  type TableNamesInDataModel,
} from "convex/server";
import { v, type GenericId } from "convex/values";
import type { ComponentApi } from "../_generated/component";
import { vAnswers, vJudgment, type Answers, type Judgment, type Questions as StoredQuestions } from "../validators";

export { choice, noul, score } from "@typesafe-ai/sdk";
export { vJudgment };

type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
type Questions = Record<string, Question>;

export type AnswersOf<Q extends Questions> = {
  readonly [K in keyof Q]: Omit<ResultFor<Q[K]>, "legend">;
};

export type JudgmentOf<Q extends Questions> =
  | { state: "pending" }
  | { state: "judged"; answers: AnswersOf<Q> }
  | { state: "stale"; answers: AnswersOf<Q> }
  | { state: "failed"; error: string; answers?: AnswersOf<Q> };

type Range = { min?: number; max?: number; order?: "asc" | "desc"; limit?: number };

export type TopOptions<Q extends Question> =
  Q extends ChoiceQuestion<infer C> ? Range & { label: keyof C & string } : Range & { label?: never };

export type Hit<TableName extends string> = { id: GenericId<TableName>; value: number };

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type RunQueryCtx = {
  runQuery<Q extends FunctionReference<"query", "internal">>(
    query: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
};

type RunMutationCtx = RunQueryCtx & {
  runMutation<M extends FunctionReference<"mutation", "internal">>(
    mutation: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
};

export const vOnJudgedArgs = { docId: v.string(), answers: vAnswers };

export type OnJudged = FunctionReference<"mutation", "internal", { docId: string; answers: Answers }>;

export type IndexOptions<Doc, Q extends Questions> = {
  questions: Q;
  state: (doc: Doc) => Json;
  onJudged?: OnJudged;
  batchSize?: number;
};

export class Jevex<DataModel extends GenericDataModel> {
  constructor(private readonly component: ComponentApi) {}

  index<TableName extends TableNamesInDataModel<DataModel>, const Q extends Questions>(
    table: TableName,
    options: IndexOptions<DocumentByName<DataModel, TableName>, Q>,
  ) {
    return new JevexIndex<DataModel, TableName, Q>(this.component, table, options);
  }
}

export class JevexIndex<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  Q extends Questions,
> {
  private handle: Promise<string> | undefined;

  constructor(
    private readonly component: ComponentApi,
    readonly table: TableName,
    private readonly options: IndexOptions<DocumentByName<DataModel, TableName>, Q>,
  ) {}

  async judge(ctx: RunMutationCtx, id: GenericId<TableName>, doc: DocumentByName<DataModel, TableName>) {
    const { questions, state, onJudged, batchSize = 20 } = this.options;
    if (onJudged) this.handle ??= createFunctionHandle(onJudged);
    await ctx.runMutation(this.component.lib.judge, {
      index: this.table,
      docId: id,
      state: state(doc),
      questions: toStored(questions),
      batchSize,
      onJudged: await this.handle,
    });
  }

  async forget(ctx: RunMutationCtx, id: GenericId<TableName>) {
    await ctx.runMutation(this.component.lib.forget, { index: this.table, docId: id });
  }

  trigger() {
    return async (
      ctx: RunMutationCtx,
      { id, newDoc }: { id: GenericId<TableName>; newDoc: DocumentByName<DataModel, TableName> | null },
    ) => {
      if (newDoc) await this.judge(ctx, id, newDoc);
      else await this.forget(ctx, id);
    };
  }

  async get(ctx: RunQueryCtx, id: GenericId<TableName>) {
    return this.typed(await ctx.runQuery(this.component.lib.get, { index: this.table, docId: id }));
  }

  async getMany(ctx: RunQueryCtx, ids: GenericId<TableName>[]) {
    const judgments = await ctx.runQuery(this.component.lib.getMany, { index: this.table, docIds: ids });
    return judgments.map((judgment) => this.typed(judgment));
  }

  async top<K extends keyof Q & string>(
    ctx: RunQueryCtx,
    question: K,
    ...[options]: Q[K] extends ChoiceQuestion ? [TopOptions<Q[K]>] : [TopOptions<Q[K]>?]
  ): Promise<Hit<TableName>[]> {
    const { limit = 20, ...range } = options ?? {};
    const hits = await ctx.runQuery(this.component.lib.top, { index: this.table, question, limit, ...range });
    return hits.map(({ docId, value }) => ({ id: docId as GenericId<TableName>, value }));
  }

  answers(answers: Answers) {
    return answers as unknown as AnswersOf<Q>;
  }

  private typed(judgment: Judgment | null) {
    return judgment as JudgmentOf<Q> | null;
  }
}

function toStored(questions: Questions): StoredQuestions {
  return Object.fromEntries(
    Object.entries(questions).map(([name, question]) => [
      name,
      question.type === "score" ? { ...question, criteria: [...question.criteria] } : question,
    ]),
  );
}
