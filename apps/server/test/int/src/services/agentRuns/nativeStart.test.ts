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
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let id: string;
let attemptId: string;
const context = (emit: Parameters<Harness["ctx"]>[0] = () => {}) =>
	({
		...h.ctx(emit),
		newTx: h.read,
		home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	}) as unknown as Parameters<typeof startNative>[0];
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
test.each(["custom", "codex"] as const)(
	"a %s manager reaches preparation only when the harness enforces its tool boundary",
	async (preset) => {
		let prepared = false;
		const run = await h.read((tx) => getRun(tx, id));
		const ctx = context();
		await startNative(
			ctx,
			{
				run,
				config: ProjectManagerConfigSchema.parse({
					personaId: null,
					directory: "/tmp",
					harness: { preset, startCommand: "/bin/true", resumeCommand: "/bin/true" },
				}),
				resume: false,
				context: "Fixture",
				attempt: { id: attemptId, generation: 1, token: "fixture-token" },
			},
			{
				environment: async () => {
					prepared = true;
					throw new Error("Unexpected environment lookup");
				},
			},
		);
		const after = await h.read((tx) => getRun(tx, id));
		expect(after.error).toBe(
			preset === "codex"
				? "Unexpected environment lookup"
				: `The ${preset} harness cannot enforce the manager tool boundary. Select Claude, Codex, OpenCode, Pi, or Muse for managers. Workers can use any harness.`,
		);
		expect(after.closedAt).not.toBeNull();
		expect(prepared).toBe(preset === "codex");
	},
);
test.each([
	["stopped", "workspace"],
	["replaced", "workspace"],
	["stopped", "environment"],
	["replaced", "environment"],
])("a %s start during %s cannot commit its workspace or launch", async (kind, boundary) => {
	const run = await h.read((tx) => getRun(tx, id));
	const ctx = context((event) => h.flushed.push(event));
	const config = ProjectManagerConfigSchema.parse({
		personaId: null,
		directory: "/tmp",
		ade: "native",
	});
	const replacement = kind === "replaced" ? randomUUID() : attemptId;
	const retire = () =>
		h.rows(
			sql`UPDATE agent_runs SET terminal_id=${replacement},closed_at=${kind === "stopped" ? new Date() : null} WHERE id=${id}`,
		);
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
				if (boundary === "workspace") await retire();
				return "/tmp/retired-workspace";
			},
			environment: async () => {
				if (boundary === "environment") await retire();
				return { ...process.env };
			},
		},
	);
	const after = await h.read((tx) => getRun(tx, id));
	expect(after.terminalId).toBe(replacement);
	expect(after.workspaceId).toBeNull();
	expect(after.closedAt !== null).toBe(kind === "stopped");
	expect(existsSync(join(home, "runtime"))).toBe(false);
});

test.each(["workspace", "environment"])(
	"a failure in %s closes the unlaunched assignment and preserves its cause",
	async (boundary) => {
		const run = await h.read((tx) => getRun(tx, id));
		const ctx = context();
		await startNative(
			ctx,
			{
				run,
				config: ProjectManagerConfigSchema.parse({
					personaId: null,
					directory: "/missing",
				}),
				resume: false,
				context: "Fixture",
				attempt: { id: attemptId, generation: 1, token: "fixture-token" },
			},
			{
				workspace: async () => {
					if (boundary === "workspace") throw new Error("Repository directory /missing does not exist");
					return "/tmp";
				},
				environment: async () => {
					if (boundary === "environment") throw new Error("Login shell failed (exit 42).");
					return { ...process.env };
				},
			},
		);
		const after = await h.read((tx) => getRun(tx, id));
		expect(after.closedAt).not.toBeNull();
		expect(after.error).toBe(
			boundary === "workspace" ? "Repository directory /missing does not exist" : "Login shell failed (exit 42).",
		);
		expect(existsSync(join(home, "runtime"))).toBe(false);
	},
);

test("an uncertain launch reply keeps the assignment open for process inspection", async () => {
	mkdirSync(join(home, "runtime"));
	let submitted = false;
	let launchPath: string | undefined;
	let launchCredential: string | undefined;
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
				launchCredential = request.params.env.OPENAI_API_KEY;
				socket.destroy();
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(join(home, "runtime", "runtime.sock"), resolve));
	try {
		const run = await h.read((tx) => getRun(tx, id));
		const ctx = context();
		await expect(
			startNative(
				ctx,
				{
					run,
					config: ProjectManagerConfigSchema.parse({
						personaId: null,
						directory: "/tmp",
					}),
					resume: false,
					context: "Fixture",
					attempt: { id: attemptId, generation: 1, token: "fixture-token" },
				},
				{
					workspace: async () => "/tmp",
					environment: async () => ({ ...process.env, OPENAI_API_KEY: "fixture-provider-credential" }),
				},
			),
		).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE" });
		const after = await h.read((tx) => getRun(tx, id));
		expect(submitted).toBe(true);
		expect(launchPath).toBe(process.env.PATH);
		expect(launchCredential).toBe("fixture-provider-credential");
		expect(after.closedAt).toBeNull();
		expect(after.error).toContain("response is unknown");
		expect(after.sessionLost).toBe(false);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test.each(["acknowledged", "exited", "unknown"])(
	"a Claude start waits for its initial prompt receipt: %s",
	async (outcome) => {
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
							`${JSON.stringify({ id: request.id, result: { type: "session", session: { ...session, agent: { sessionId: "provider-conversation" }, error: outcome === "unknown" ? "The agent did not acknowledge this message" : null, status: outcome === "unknown" ? "unknown" : outcome === "exited" ? "exited" : "running", acknowledgedMessageIds: outcome !== "unknown" ? [attemptId] : [] } } })}\n`,
						);
					subscribed();
				}
			});
		});
		await new Promise<void>((resolve) => server.listen(join(home, "runtime", "runtime.sock"), resolve));
		try {
			if (outcome === "exited") {
				await h.read(async (tx) => {
					const current = await getRun(tx, id);
					const statuses = await seedStatuses(tx, current.projectId!);
					const ticketId = await seedTicket(tx, {
						projectId: current.projectId!,
						rootId: current.projectId!,
						statusId: statuses.started,
					});
					await tx.execute(sql`UPDATE agent_runs SET kind='builder',ticket_id=${ticketId} WHERE id=${id}`);
				});
			}
			const run = await h.read((tx) => getRun(tx, id));
			const ctx = context();
			const start = startNative(
				ctx,
				{
					run,
					config: ProjectManagerConfigSchema.parse({
						personaId: null,
						directory: "/tmp",
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
			if (outcome !== "unknown") {
				await start;
				expect((await h.read((tx) => getRun(tx, id))).error).toBeNull();
				expect((await h.read((tx) => getRun(tx, id))).sessionId).toBe("provider-conversation");
				expect((await h.read((tx) => getRun(tx, id))).closedAt).toBeNull();
			} else {
				await expect(start).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE" });
				const after = await h.read((tx) => getRun(tx, id));
				expect(after.closedAt).toBeNull();
				expect(after.error).toContain("did not acknowledge");
				expect(after.sessionLost).toBe(false);
			}
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	},
);

test("an empty root directory reports a configuration error before runtime launch", async () => {
	let runtimeCalled = false;
	await startNative(
		context(),
		{
			run: await h.read((tx) => getRun(tx, id)),
			config: ProjectManagerConfigSchema.parse({ personaId: null, directory: "" }),
			resume: false,
			context: "Fixture",
			attempt: { id: attemptId, generation: 1, token: "fixture-token" },
		},
		{
			env: {},
			runtime: async () => {
				runtimeCalled = true;
				throw new Error("Unexpected runtime start");
			},
		},
	);
	expect(runtimeCalled).toBe(false);
	expect((await h.read((tx) => getRun(tx, id))).error).toBe(
		"Select the local repository directory before you start a native agent.",
	);
});

test.each(["todo", "agentReview"] as const)(
	"an automatic builder cannot start after its ticket moves to %s",
	async (next) => {
		const run = await h.read((tx) => getRun(tx, id));
		const statuses = await h.read((tx) => seedStatuses(tx, run.projectId!));
		const ticket = await h.read((tx) =>
			seedTicket(tx, { projectId: run.projectId!, rootId: run.projectId!, statusId: statuses.started }),
		);
		await h.rows(sql`UPDATE agent_runs SET kind='builder',ticket_id=${ticket} WHERE id=${id}`);
		let runtimeCalled = false;
		await startNative(
			context(),
			{
				run: await h.read((tx) => getRun(tx, id)),
				config: ProjectManagerConfigSchema.parse({ personaId: null, directory: "/tmp" }),
				resume: false,
				context: "Fixture",
				attempt: { id: attemptId, generation: 1, token: "fixture-token" },
				requiredTicketCategory: "started",
			},
			{
				env: {},
				workspace: async () => {
					await h.rows(sql`UPDATE tickets SET status_id=${statuses[next]} WHERE id=${ticket}`);
					return "/tmp";
				},
				runtime: async () => {
					runtimeCalled = true;
					throw new Error("Unexpected runtime launch");
				},
			},
		);
		expect(runtimeCalled).toBe(false);
		expect((await h.read((tx) => getRun(tx, id))).closedAt).not.toBeNull();
	},
);
