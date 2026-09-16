import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import type { RestartSession } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { buildRuntime } from "../../../../../../runtime/test/runtimeBuild.ts";
import { nativeClient } from "../../../../../src/agents/native/connection.ts";
import { prepareStop } from "../../../../../src/services/agentRuns/lifecycle.ts";
import { reserveRestart } from "../../../../../src/services/restartAgents/reserveRestart.ts";
import { seedActors, seedRoot } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let server: Server;
let reached: Promise<void>;
let release: () => void;
let processes: Map<string, "running" | "exited" | "unknown">;
let stopFails: boolean;
const entry: RestartSession = {
	runId: "assignment",
	previousAttemptId: "previous",
	providerSessionId: "provider-session",
	harness: "codex",
	workspace: "/tmp/work",
	processIdentity: "saved-identity",
	attempt: { id: "replacement", token: "new-token" },
};
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	home = await mkdtemp("/tmp/trl-stop-race-");
	await mkdir(join(home, "runtime"));
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "STOP");
		await tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"directory":"/tmp/work"}'::jsonb WHERE id=${project}`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,workspace_id,created_at,updated_at) VALUES ('assignment','Worker','native','Builder','builder','Task',${project},'STOP','previous','provider-session','/tmp/work',now(),now())`,
		);
	});
	let entered: () => void;
	reached = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const barrier = new Promise<void>((resolve) => {
		release = resolve;
	});
	let first = true;
	processes = new Map([["previous", "running"]]);
	stopFails = false;
	server = createServer((socket) =>
		socket.once("data", async (data) => {
			const request = JSON.parse(data.toString());
			let result: unknown;
			if (request.method === "hello") {
				if (first) {
					first = false;
					entered();
					await barrier;
				}
				result = { version: 6, capabilities: ["terminal-stream"] };
			} else if (request.method === "stop") {
				processes.set(request.params.id, stopFails ? "unknown" : "exited");
				result = {
					id: request.params.id,
					status: processes.get(request.params.id),
					error: stopFails ? "Process ownership is unknown" : null,
				};
			} else result = { data: "", startOffset: 0, nextOffset: 0, truncated: false };
			socket.end(`${JSON.stringify({ id: request.id, result })}\n`);
		}),
	);
	await new Promise<void>((resolve) => server.listen(join(home, "runtime/runtime.sock"), resolve));
});
afterEach(async () => {
	release();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await h.read(assertStatusInvariant);
	await rm(home, { recursive: true, force: true });
});
const context = () =>
	({ ...h.ctx(() => {}), newTx: h.read, home, now: () => new Date() }) as unknown as Parameters<typeof prepareStop>[0];
const reserve = () =>
	h.read((tx) =>
		reserveRestart(
			h.ctx(() => {}),
			tx,
			entry,
			true,
		),
	);

test("manual stop fences restart reservation before runtime I/O completes", async () => {
	const stop = prepareStop(context(), { id: entry.runId });
	await reached;
	const reservation = await reserve();
	if (reservation) processes.set(entry.attempt.id, "running");
	release();
	await stop;
	expect(reservation).toBeNull();
	expect([...processes.values()]).not.toContain("running");
	expect((await h.rows(sql`SELECT closed_at FROM agent_runs WHERE id='assignment'`))[0]!.closed_at).not.toBeNull();
});
test("manual stop targets the replacement when restart reserves first", async () => {
	expect(await reserve()).not.toBeNull();
	processes.set("previous", "exited");
	processes.set(entry.attempt.id, "running");
	const stop = prepareStop(context(), { id: entry.runId });
	await reached;
	release();
	await stop;
	expect(processes.get(entry.attempt.id)).toBe("exited");
	expect(await reserve()).toBeNull();
});
test("failed process cleanup preserves stop intent and reports failure", async () => {
	stopFails = true;
	const stop = prepareStop(context(), { id: entry.runId });
	const outcome = stop.then(
		() => null,
		(error: Error) => error,
	);
	await reached;
	release();
	expect((await outcome)?.message).toContain("Process ownership is unknown");
	expect(processes.get("previous")).toBe("unknown");
	expect(await reserve()).toBeNull();
	stopFails = false;
	await prepareStop(context(), { id: entry.runId });
	expect(processes.get("previous")).toBe("exited");
});

test("a closed assignment still confirms its terminal stop when the runtime is absent", async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await buildRuntime();
	await h.rows(sql`UPDATE agent_runs SET closed_at=now() WHERE id='assignment'`);
	const client = nativeClient(home);
	try {
		await prepareStop(context(), { id: entry.runId });
		expect(await client.inspect(entry.previousAttemptId)).toMatchObject({ status: "exited" });
		await expect(
			client.start({ id: entry.previousAttemptId, command: "/bin/cat", args: [], cwd: home, mode: "pty" }),
		).resolves.toMatchObject({ status: "exited" });
	} finally {
		await client.shutdown();
	}
});
