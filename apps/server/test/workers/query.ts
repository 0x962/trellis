import { sql } from "drizzle-orm";
import { openWorkerDatabase } from "../../src/db/worker.ts";

const db = await openWorkerDatabase(":memory:");
postMessage({ type: "ready" });

self.onmessage = async () => {
	const started = performance.now();
	await db.execute(sql`SELECT pg_sleep(0.2)`);
	postMessage({ type: "done", elapsed: performance.now() - started });
};
