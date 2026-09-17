import { afterEach, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
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

test("stop reports failed process cleanup as a runtime error and keeps the assignment open", async () => {
	t = await createTestApp();
	const project = await t.seedProject("STP");
	const id = ulid();
	const terminalId = ulid();
	await t.editServerTx((tx) =>
		tx.execute(sql`INSERT INTO agent_runs (id, name, runtime, persona_name, kind, instruction, project_id, project_path, terminal_id, created_at, updated_at)
			VALUES (${id}, 'Hana', 'native', 'Manager', 'manager', 'Manage.', ${project.id}, 'STP', ${terminalId}, NOW(), NOW())`),
	);
	const error = "Process cleanup is unconfirmed: spawnSync /bin/ps ETIMEDOUT";
	let stopFails = false;
	mkdirSync(join(t.home, "runtime"), { recursive: true });
	runtime = createServer((socket) => {
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer);
			if (request.method === "stop" && stopFails) {
				socket.end(`${JSON.stringify({ id: request.id, error: { code: "RUNTIME_ERROR", message: error } })}\n`);
				return;
			}
			const result =
				request.method === "hello"
					? { version: RUNTIME_PROTOCOL_VERSION }
					: { id: terminalId, status: "running", controllable: false, error };
			socket.end(`${JSON.stringify({ id: request.id, result })}\n`);
		});
	});
	await new Promise<void>((resolve) => runtime.listen(join(t.home, "runtime/runtime.sock"), resolve));
	await expect(t.client.agentRuns.stop({ id })).rejects.toMatchObject({
		code: "RUNNER_UNAVAILABLE",
		status: 503,
		message: `Could not stop Hana. ${error}`,
		data: { reason: "error" },
	});
	stopFails = true;
	await expect(t.client.agentRuns.stop({ id })).rejects.toMatchObject({
		code: "RUNNER_UNAVAILABLE",
		status: 503,
		message: `Could not stop Hana. ${error}`,
		data: { reason: "error" },
	});
	const row = await t.editServerTx(async (tx) =>
		(await tx.execute(sql`SELECT closed_at FROM agent_runs WHERE id=${id}`)).rows.at(0),
	);
	expect(row?.closed_at).toBeNull();
});
