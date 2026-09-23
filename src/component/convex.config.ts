import { defineComponent } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";

const component = defineComponent("jevex", {
  env: {
    TYPESAFE_API_KEY: v.string(),
    TYPESAFE_BASE_URL: v.optional(v.string()),
  },
});

component.use(workpool, { name: "judges" });

export default component;
