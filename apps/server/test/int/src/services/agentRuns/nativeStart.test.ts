import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { seedActors, seedRoot } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let id: string;
let attemptId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(async () => {
	await h.read(assertStatusInvariant);
	rmSync(home, { recursive: true, force: true });
});
beforeEach(async () => {
	await h.reset();
	home = mkdtempSync("/tmp/native-start-fence-");
	id = ulid();
	attemptId = randomUUID();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "FENCE");
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at) VALUES (${id},'Manager','native','Manager','manager','Wait',${project},'FENCE',${attemptId},${randomUUID()},now(),now())`,
		);
	});
});
test.each(["stopped", "replaced"])("a %s start cannot commit its workspace or launch", async (kind) => {
	const run = await h.read((tx) => getRun(tx, id));
	const ctx = {
		...h.ctx((event) => h.flushed.push(event)),
		newTx: h.read,
		home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof startNative>[0];
	const config = ProjectManagerConfigSchema.parse({
		personaId: null,
		concurrency: 1,
		directory: "/tmp",
		ade: "native",
		trustedDirectory: true,
	});
	const replacement = kind === "replaced" ? randomUUID() : attemptId;
	await startNative(
		ctx,
		{
			run,
			config,
			resume: false,
			context: "Fixture",
			attempt: { id: attemptId, generation: 1, token: "fixture-token" },
		},
		{
			workspace: async () => {
				await h.rows(
					sql`UPDATE agent_runs SET terminal_id=${replacement},closed_at=${kind === "stopped" ? new Date() : null} WHERE id=${id}`,
				);
				return "/tmp/retired-workspace";
			},
		},
	);
	const after = await h.read((tx) => getRun(tx, id));
	expect(after.terminalId).toBe(replacement);
	expect(after.workspaceId).toBeNull();
	expect(after.closedAt !== null).toBe(kind === "stopped");
	expect(existsSync(join(home, "runtime"))).toBe(false);
});

test("a workspace failure closes the unlaunched assignment and preserves its cause", async () => {
	const run = await h.read((tx) => getRun(tx, id));
	const ctx = {
		...h.ctx(() => {}),
		newTx: h.read,
		home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	} as unknown as Parameters<typeof startNative>[0];
	await startNative(
		ctx,
		{
			run,
			config: ProjectManagerConfigSchema.parse({
				personaId: null,
				concurrency: 1,
				directory: "/missing",
				trustedDirectory: true,
			}),
			resume: false,
			context: "Fixture",
			attempt: { id: attemptId, generation: 1, token: "fixture-token" },
		},
		{
			workspace: async () => {
				throw new Error("Repository directory /missing does not exist");
			},
		},
	);
	const after = await h.read((tx) => getRun(tx, id));
	expect(after.closedAt).not.toBeNull();
	expect(after.error).toBe("Repository directory /missing does not exist");
	expect(existsSync(join(home, "runtime"))).toBe(false);
});

test("an uncertain launch reply keeps the assignment open for process inspection", async () => {
	mkdirSync(join(home, "runtime"));
	let submitted = false;
	let launchPath: string | undefined;
	const server = createServer((socket) => {
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer.split("\n")[0]!);
			if (request.method === "hello")
				socket.end(`${JSON.stringify({ id: request.id, result: { version: RUNTIME_PROTOCOL_VERSION } })}\n`);
			else {
				submitted = true;
				launchPath = request.params.env.PATH;
				socket.destroy();
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(join(home, "runtime", "runtime.sock"), resolve));
	try {
		const run = await h.read((tx) => getRun(tx, id));
		const ctx = {
			...h.ctx(() => {}),
			newTx: h.read,
			home,
			now: () => new Date(),
			localUrl: "http://127.0.0.1:4521",
		} as unknown as Parameters<typeof startNative>[0];
		await expect(
			startNative(
				ctx,
				{
					run,
					config: ProjectManagerConfigSchema.parse({
						personaId: null,
						concurrency: 1,
						directory: "/tmp",
						trustedDirectory: true,
					}),
					resume: false,
					context: "Fixture",
					attempt: { id: attemptId, generation: 1, token: "fixture-token" },
				},
				{ workspace: async () => "/tmp" },
			),
		).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE" });
		const after = await h.read((tx) => getRun(tx, id));
		expect(submitted).toBe(true);
		expect(launchPath).toBe(process.env.PATH);
		expect(after.closedAt).toBeNull();
		expect(after.error).toContain("response is unknown");
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test.each(["acknowledged", "unknown"])("a Claude start waits for its initial prompt receipt: %s", async (outcome) => {
	mkdirSync(join(home, "runtime"));
	let subscribed!: () => void;
	const subscription = new Promise<void>((resolve) => {
		subscribed = resolve;
	});
	let acknowledge!: () => void;
	const server = createServer((socket) => {
		socket.setEncoding("utf8");
		let buffer = "";
		socket.on("data", (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer.split("\n")[0]!);
			const session = { id: attemptId, status: "running", error: null, acknowledgedMessageIds: [] };
			if (request.method === "hello")
				socket.end(`${JSON.stringify({ id: request.id, result: { version: RUNTIME_PROTOCOL_VERSION } })}\n`);
			else if (request.method === "start") socket.end(`${JSON.stringify({ id: request.id, result: session })}\n`);
			else if (request.method === "subscribe") {
				acknowledge = () =>
					socket.write(
						`${JSON.stringify({ id: request.id, result: { type: "session", session: { ...session, agent: { sessionId: "provider-conversation" }, error: outcome === "unknown" ? "The agent did not acknowledge this message" : null, status: outcome === "unknown" ? "unknown" : "running", acknowledgedMessageIds: outcome === "acknowledged" ? [attemptId] : [] } } })}\n`,
					);
				subscribed();
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(join(home, "runtime", "runtime.sock"), resolve));
	try {
		const run = await h.read((tx) => getRun(tx, id));
		const ctx = {
			...h.ctx(() => {}),
			newTx: h.read,
			home,
			now: () => new Date(),
			localUrl: "http://127.0.0.1:4521",
		} as unknown as Parameters<typeof startNative>[0];
		const start = startNative(
			ctx,
			{
				run,
				config: ProjectManagerConfigSchema.parse({
					personaId: null,
					concurrency: 1,
					directory: "/tmp",
					trustedDirectory: true,
				}),
				resume: false,
				context: "Fixture",
				attempt: { id: attemptId, generation: 1, token: "fixture-token" },
			},
			{ workspace: async () => "/tmp" },
		);
		expect(await Promise.race([subscription.then(() => "subscribed"), start.then(() => "returned")])).toBe(
			"subscribed",
		);
		acknowledge();
		if (outcome === "acknowledged") {
			await start;
			expect((await h.read((tx) => getRun(tx, id))).error).toBeNull();
			expect((await h.read((tx) => getRun(tx, id))).sessionId).toBe("provider-conversation");
		} else {
			await expect(start).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE" });
			const after = await h.read((tx) => getRun(tx, id));
			expect(after.closedAt).toBeNull();
			expect(after.error).toContain("did not acknowledge");
		}
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
