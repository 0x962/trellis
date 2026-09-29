import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { loadConfig } from "../config.ts";
import { systemContext } from "../context.ts";
import { createBus } from "../events/bus.ts";
import { openDb } from "./client.ts";
import { migratedTar } from "./testDb.ts";
import { createWorkerTransport, type Runtime } from "./transport.ts";

const runtime: Runtime = {
	version: "test",
	bootId: "worker-stream-test",
	gh: Object.assign(async () => ({ ok: true as const, code: 0, stdout: "", stderr: "" }), {
		bin: "unused",
		timeoutMs: 1000,
	}),
	ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: new Date().toISOString() }),
	addresses: async () => [],
};

test("relays an error and closes the worker stream", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-worker-stream-"));
	const config = loadConfig({ TRELLIS_HOME: home, TRELLIS_PORT: "0" });
	const db = await openDb(config.dbDir, await migratedTar());
	await db.execute(sql`CREATE TABLE aaa_stream_failure (value text)`);
	await db.$client.close();
	const transport = createWorkerTransport({ bus: createBus({ bootId: runtime.bootId }), config, runtime });
	try {
		await transport.start();
		const stream = (await transport.call("system.export", systemContext(), {})) as ReadableStream<Uint8Array>;
		await expect(stream.getReader().read()).rejects.toThrow();
		await transport.close();
	} finally {
		await transport.close();
		await rm(home, { recursive: true, force: true });
	}
}, 30_000);
