import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { prepareSend } from "../../../../../src/services/agentRuns/communication.ts";
import { seedRoot } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	const project = await h.read((tx) => seedRoot(tx, "SEND"));
	await h.rows(
		sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,created_at,updated_at) VALUES ('run','Manager','native','Manager','manager','Wait',${project},'SEND','attempt','conversation',now(),now())`,
	);
});
const session = (change: Partial<RuntimeProcessStatus> = {}): RuntimeProcessStatus => ({
	id: "attempt",
	daemonId: "daemon",
	pid: 123,
	mode: "pty",
	status: "running",
	startedAt: "now",
	endedAt: null,
	exitCode: null,
	error: null,
	checkedAt: "now",
	elapsedMs: 0,
	controllable: true,
	process: null,
	launch: { command: "/bin/zsh", args: ['claude --settings {"UserPromptSubmit":"/tmp/claudeHook.ts"}'], cwd: "/tmp" },
	activity: null,
	acknowledgedMessageIds: [],
	result: null,
	...change,
});
const context = () =>
	({ ...h.ctx(() => {}), newTx: h.read, home: "/tmp/unused" }) as unknown as Parameters<typeof prepareSend>[0];

test("a preinitialization send waits for the initial receipt before it writes input", async () => {
	let release!: () => void;
	const ready = new Promise<void>((resolve) => {
		release = resolve;
	});
	let listening!: () => void;
	const subscribed = new Promise<void>((resolve) => {
		listening = resolve;
	});
	let writes = 0;
	let idleRequired: boolean | undefined;
	let observations = 0;
	const sent = prepareSend(
		context(),
		{ id: "run", text: "Follow up", messageId: "followup" },
		{
			inspect: async () => session(),
			deliver: async (_id, _message, _data, requireIdle) => {
				writes++;
				idleRequired = requireIdle;
				return { status: "written", messageId: "followup" };
			},
			subscribeSession: async function* () {
				observations++;
				if (observations === 1) {
					listening();
					await ready;
				}
				yield {
					type: "session",
					session: session({ acknowledgedMessageIds: observations === 1 ? ["attempt"] : ["attempt", "followup"] }),
				};
			},
		},
	);
	expect(await Promise.race([subscribed.then(() => "waiting"), sent.then(() => "returned")])).toBe("waiting");
	expect(writes).toBe(0);
	release();
	await sent;
	expect(writes).toBe(1);
	expect(idleRequired).toBe(true);
	expect(observations).toBe(2);
});

test.each([false, true])("a busy hook-enabled send reports not sent with controller=%s", async (controller) => {
	const busy = Object.assign(new Error("busy"), { code: "RUNTIME_BUSY" });
	const send = prepareSend(
		context(),
		{ id: "run", text: "Follow up", requireIdle: controller },
		{
			inspect: async () =>
				session({ acknowledgedMessageIds: ["attempt"], activity: { state: "working", updatedAt: "now" } }),
			deliver: async (_id, _message, _data, requireIdle) => {
				expect(requireIdle).toBe(true);
				throw busy;
			},
			subscribeSession: async function* () {
				expect.unreachable("A rejected write has no receipt stream");
				yield { type: "session", session: session() };
			},
		},
	);
	if (controller) await expect(send).rejects.toMatchObject({ code: "RUNTIME_BUSY" });
	else
		await expect(send).rejects.toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			message: "Agent is busy. No message was sent. Wait for the current turn to finish.",
		});
});

test("a written message without its receipt does not return success", async () => {
	await expect(
		prepareSend(
			context(),
			{ id: "run", text: "Follow up" },
			{
				inspect: async () =>
					session({ acknowledgedMessageIds: ["attempt"], activity: { state: "idle", updatedAt: "now" } }),
				deliver: async () => ({ status: "written", messageId: "followup" }),
				subscribeSession: async function* () {
					yield { type: "session", session: session({ status: "exited", acknowledgedMessageIds: ["attempt"] }) };
				},
			},
		),
	).rejects.toMatchObject({
		code: "RUNNER_UNAVAILABLE",
		message:
			"The agent process is not confirmed running. It did not acknowledge this message. Inspect its terminal before a resend.",
	});
});

test("an interactive custom PTY sends raw input without a hook receipt", async () => {
	let writes = 0;
	await prepareSend(
		context(),
		{ id: "run", text: "Input" },
		{
			inspect: async () => session({ launch: { command: "/bin/cat", args: [], cwd: "/tmp" } }),
			deliver: async (_id, messageId, _data, requireIdle) => {
				writes++;
				expect(requireIdle).not.toBe(true);
				return { status: "written", messageId };
			},
			subscribeSession: async function* () {
				expect.unreachable("A raw terminal has no message receipt");
				yield { type: "session", session: session() };
			},
		},
	);
	expect(writes).toBe(1);
});

test("a closed assignment rejects a send before it contacts the runtime", async () => {
	await h.rows(sql`UPDATE agent_runs SET closed_at=now() WHERE id='run'`);
	let inspected = false;
	await expect(
		prepareSend(
			context(),
			{ id: "run", text: "Do more work" },
			{
				inspect: async () => {
					inspected = true;
					return session({ launch: { command: "/bin/cat", args: [], cwd: "/tmp" } });
				},
				deliver: async (_id, messageId) => ({ status: "written", messageId }),
				subscribeSession: async function* () {
					yield { type: "session", session: session() };
				},
			},
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(inspected).toBe(false);
});
