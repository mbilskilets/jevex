/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      forget: FunctionReference<
        "mutation",
        "internal",
        { docId: string; index: string },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { docId: string; index: string },
        | { state: "pending" }
        | {
            answers: Record<
              string,
              | { noul: number; type: "noul" }
              | {
                  choice: string;
                  confidence: number;
                  probabilities: Record<string, number>;
                  type: "choice";
                }
              | {
                  confidence: number;
                  probabilities: Record<string, number>;
                  score: number;
                  type: "score";
                }
            >;
            state: "judged";
          }
        | {
            answers: Record<
              string,
              | { noul: number; type: "noul" }
              | {
                  choice: string;
                  confidence: number;
                  probabilities: Record<string, number>;
                  type: "choice";
                }
              | {
                  confidence: number;
                  probabilities: Record<string, number>;
                  score: number;
                  type: "score";
                }
            >;
            state: "stale";
          }
        | {
            answers?: Record<
              string,
              | { noul: number; type: "noul" }
              | {
                  choice: string;
                  confidence: number;
                  probabilities: Record<string, number>;
                  type: "choice";
                }
              | {
                  confidence: number;
                  probabilities: Record<string, number>;
                  score: number;
                  type: "score";
                }
            >;
            error: string;
            state: "failed";
          }
        | null,
        Name
      >;
      getMany: FunctionReference<
        "query",
        "internal",
        { docIds: Array<string>; index: string },
        Array<
          | { state: "pending" }
          | {
              answers: Record<
                string,
                | { noul: number; type: "noul" }
                | {
                    choice: string;
                    confidence: number;
                    probabilities: Record<string, number>;
                    type: "choice";
                  }
                | {
                    confidence: number;
                    probabilities: Record<string, number>;
                    score: number;
                    type: "score";
                  }
              >;
              state: "judged";
            }
          | {
              answers: Record<
                string,
                | { noul: number; type: "noul" }
                | {
                    choice: string;
                    confidence: number;
                    probabilities: Record<string, number>;
                    type: "choice";
                  }
                | {
                    confidence: number;
                    probabilities: Record<string, number>;
                    score: number;
                    type: "score";
                  }
              >;
              state: "stale";
            }
          | {
              answers?: Record<
                string,
                | { noul: number; type: "noul" }
                | {
                    choice: string;
                    confidence: number;
                    probabilities: Record<string, number>;
                    type: "choice";
                  }
                | {
                    confidence: number;
                    probabilities: Record<string, number>;
                    score: number;
                    type: "score";
                  }
              >;
              error: string;
              state: "failed";
            }
          | null
        >,
        Name
      >;
      judge: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize: number;
          docId: string;
          index: string;
          onJudged?: string;
          questions: Record<
            string,
            | {
                criteria?: null | { false?: any; true?: any };
                instructions?: any;
                type: "noul";
              }
            | {
                criteria: Record<string, any>;
                instructions?: any;
                type: "choice";
              }
            | { criteria: Array<any>; instructions?: any; type: "score" }
          >;
          state: any;
        },
        null,
        Name
      >;
      top: FunctionReference<
        "query",
        "internal",
        {
          index: string;
          label?: string;
          limit: number;
          max?: number;
          min?: number;
          order?: "asc" | "desc";
          question: string;
        },
        Array<{ docId: string; label?: string; value: number }>,
        Name
      >;
    };
  };
