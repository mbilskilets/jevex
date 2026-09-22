import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("recover expired leases", { minutes: 1 }, internal.batch.recover, {});

export default crons;
