// convex/convex.config.ts
import { defineApp } from "convex/server";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();
app.use(shardedCounter);
app.use(workpool, { name: "rowIngestionWorkpool" });
// Use convex AI implementation (built on top of ai sdk)
app.use(agent);
export default app;