import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { websocket } from "hono/bun";
import { buildRuntime } from "../../../../../runtime/test/runtimeBuild.ts";
import { ensureNativeRuntime, nativeClient } from "../../../../src/agents/native/connection.ts";
import { nativeOutput } from "../../../../src/services/agentRuns/nativeLifecycle.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let h: TestDb;
let t: TestApp;
const id = "01M2HGY58VB4J2AYRVGDFHHB3P";
const attempt = "retained-attempt";
const retained = "terminal output before package restart";
const path = `/api/agent-runs/${id}/terminal`;
const until = async (done: () => boolean | Promise<boolean>) => {
	const deadline = Date.now() + 5000;
	while (!(await done())) {
		if (Date.now() > deadline) throw new Error("Runtime transition timed out");
		await Bun.sleep(20);
	}
};
const absent = () =>
	!existsSync(join(t.home, "runtime/manifest.json")) && !existsSync(join(t.home, "runtime/runtime.sock"));

beforeAll(async () => {
	await buildRuntime();
	h = await freshDb();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h, home: mkdtempSync("/tmp/trl-replay-") });
	const runtime = await ensureNativeRuntime(t.home);
	await runtime.start({ id: attempt, command: "/bin/echo", args: [retained], cwd: t.home, mode: "pty" });
	await until(async () => (await runtime.inspect(attempt)).status === "exited");
	await t.editServerTx((tx) =>
		tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_path,terminal_id,closed_at,created_at,updated_at)
		VALUES (${id},'Hana','Builder','builder','Build','TRL',${attempt},now(),now(),now())`),
	);
	await t.client.system.stopNativeWork({});
	await until(absent);
	expect(await t.client.system.nativeWork({})).toEqual({ paused: true });
});
afterEach(async () => {
	if (!absent()) {
		await nativeClient(t.home).shutdown();
		await until(absent);
	}
	await t.serverTx((tx) => assertStatusInvariant(tx));
	await t.close();
});
const assertNoAgents = async () => {
	const sessions = await nativeClient(t.home).list();
	expect(sessions).toHaveLength(1);
	expect(sessions[0]).toMatchObject({ id: attempt, status: "exited" });
	expect(await t.client.system.nativeWork({})).toEqual({ paused: true });
};

test("SSE replays a stopped terminal after the runtime stops while local work is paused", async () => {
	const response = await t.app.request(`http://trellis.test${path}/stream?attemptId=${attempt}`);
	expect(response.status).toBe(200);
	const body = await response.text();
	expect(body).toContain('"status":"exited"');
	const output = body
		.split("\n")
		.filter((line) => line.startsWith("data: "))
		.map((line) => JSON.parse(line.slice(6)))
		.filter((event) => event.data)
		.map((event) => Buffer.from(event.data, "base64").toString())
		.join("");
	expect(output).toContain(retained);
	await assertNoAgents();
});

test("terminal session and output readers start only the runtime for retained history", async () => {
	expect(await t.client.agentRuns.session({ id })).toMatchObject({ id: attempt, status: "exited" });
	await assertNoAgents();
	await nativeClient(t.home).shutdown();
	await until(absent);
	const output = await t.client.agentRuns.terminalOutput({ id });
	expect(Buffer.from(output.data, "base64").toString()).toContain(retained);
	await assertNoAgents();
});

test("native output can read retained bytes after the runtime stops", async () => {
	expect(await nativeOutput(t.home, attempt)).toContain(retained);
	await assertNoAgents();
});

test("terminal controls reject stopped attempts and validate target before runtime access", async () => {
	await expect(
		t.client.agentRuns.terminalInput({ id, expectedTerminalId: "old-attempt", text: "input" }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(absent()).toBe(true);
	await expect(
		t.client.agentRuns.terminalInput({ id, expectedTerminalId: attempt, text: "input" }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await assertNoAgents();
});

test("WebSocket replays a stopped terminal after the runtime stops", async () => {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request, server) => t.app.fetch(request, server),
		websocket,
	});
	const socket = new WebSocket(`ws://127.0.0.1:${server.port}${path}/socket?attemptId=${attempt}`);
	let output = "";
	let exited = false;
	try {
		await new Promise<void>((resolve, reject) => {
			socket.addEventListener("error", reject);
			socket.binaryType = "arraybuffer";
			socket.addEventListener("message", ({ data }) => {
				if (data instanceof ArrayBuffer) output += Buffer.from(data).subarray(17).toString();
				else {
					const event = JSON.parse(data.toString());
					if (event.type === "session" && event.session.status === "exited") exited = true;
					if (event.type === "error") reject(new Error(event.message));
				}
			});
			socket.addEventListener("close", () => resolve());
		});
		expect(exited).toBe(true);
		expect(output).toContain(retained);
		await assertNoAgents();
	} finally {
		socket.close();
		server.stop(true);
	}
});
