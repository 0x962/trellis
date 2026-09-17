import { afterEach, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let runtime: Server;
afterEach(async () => {
	await new Promise<void>((resolve, reject) => runtime.close((error) => (error ? reject(error) : resolve())));
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("interrupt reports an unavailable host through its declared API error", async () => {
	t = await createTestApp();
	const project = await t.seedProject("INT");
	const runId = ulid();
	const attemptId = ulid();
	await t.editServerTx((tx) =>
		tx.execute(sql`INSERT INTO agent_runs (id, name, runtime, persona_name, kind, instruction, project_id, project_path, terminal_id, created_at, updated_at)
			VALUES (${runId}, 'Builder', 'native', 'Builder', 'builder', 'Build.', ${project.id}, 'INT', ${attemptId}, NOW(), NOW())`),
	);
	const directory = join(t.home, "harness-attempts", attemptId);
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "launch.json"), JSON.stringify({ harness: "claude" }));
	mkdirSync(join(t.home, "runtime"), { recursive: true });
	runtime = createServer((socket) => {
		socket.once("data", (data) => {
			const request = JSON.parse(data.toString());
			const reply =
				request.method === "hello"
					? { id: request.id, result: { version: RUNTIME_PROTOCOL_VERSION } }
					: { id: request.id, error: { code: "RUNTIME_ERROR", message: "Fixture runtime unavailable" } };
			socket.end(`${JSON.stringify(reply)}\n`);
		});
	});
	await new Promise<void>((resolve) => runtime.listen(join(t.home, "runtime/runtime.sock"), resolve));
	await expect(t.client.agentRuns.interrupt({ id: runId, expectedTerminalId: "old-attempt" })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		status: 400,
	});
	await expect(t.client.agentRuns.interrupt({ id: runId })).rejects.toMatchObject({
		code: "RUNNER_UNAVAILABLE",
		status: 503,
		data: { reason: "error" },
	});
	writeFileSync(join(directory, "launch.json"), JSON.stringify({ harness: "custom" }));
	await expect(t.client.agentRuns.interrupt({ id: runId })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		status: 400,
	});
});
