/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "./component/schema.js";

export const modules = import.meta.glob("./component/**/*.ts");

export { schema };

/**
 * Register the jevex component (and the workpool it uses) with a convex-test instance.
 *
 * ```ts
 * import workpool from "@convex-dev/workpool/test";
 * import jevex from "jevex/test";
 *
 * const t = convexTest(schema, modules);
 * jevex.register(t);
 * workpool.register(t, "jevex/judges");
 * ```
 */
export function register(t: TestConvex<SchemaDefinition<GenericSchema, boolean>>, name = "jevex") {
  t.registerComponent(name, schema, modules);
}

export default { register, schema, modules };
