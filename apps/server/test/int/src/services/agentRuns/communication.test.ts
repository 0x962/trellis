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
	agent: null,
	controllable: true,
	process: null,
	launch: { command: "/fixture/claude", args: [], cwd: "/tmp" },
	activity: null,
	acknowledgedMessageIds: [],
	result: null,
	...change,
});
const context = () =>
	({ ...h.ctx(() => {}), newTx: h.read, home: "/tmp/unused" }) as unknown as Parameters<typeof prepareSend>[0];

type Dependencies = NonNullable<Parameters<typeof prepareSend>[2]>;
const dependencies = (
	send: Dependencies["host"]["send"],
	overrides: Partial<Dependencies["client"]> = {},
): Dependencies => ({
	client: {
		inspect: async () => session({ acknowledgedMessageIds: ["attempt"] }),
		deliver: async () => {
			throw new Error("Built-in messages must use HarnessHost.send");
		},
		subscribeSession: async function* () {
			yield { type: "session", session: session({ acknowledgedMessageIds: ["attempt"] }) };
		},
		...overrides,
	},
	host: { send },
	preset: async () => "claude",
});

test("a preinitialization send waits for the initial receipt before it reaches the host", async () => {
	let release!: () => void;
	const ready = new Promise<void>((resolve) => {
		release = resolve;
	});
	let listening!: () => void;
	const subscribed = new Promise<void>((resolve) => {
		listening = resolve;
	});
	let writes = 0;
	const sent = prepareSend(
		context(),
		{ id: "run", text: "Follow up", messageId: "followup" },
		dependencies(
			async (id, text, messageId) => {
				writes++;
				expect([id, text, messageId]).toEqual(["attempt", "Follow up", "followup"]);
				return session();
			},
			{
				inspect: async () => session(),
				subscribeSession: async function* () {
					listening();
					await ready;
					yield { type: "session", session: session({ acknowledgedMessageIds: ["attempt"] }) };
				},
			},
		),
	);
	expect(await Promise.race([subscribed.then(() => "waiting"), sent.then(() => "returned")])).toBe("waiting");
	expect(writes).toBe(0);
	release();
	await sent;
	expect(writes).toBe(1);
});

test.each([false, true])("a busy native host reports not sent with controller=%s", async (controller) => {
	const busy = Object.assign(new Error("busy"), { code: "RUNTIME_BUSY" });
	const send = prepareSend(
		context(),
		{ id: "run", text: "Follow up", requireIdle: controller },
		dependencies(async () => {
			throw busy;
		}),
	);
	if (controller) await expect(send).rejects.toMatchObject({ code: "RUNTIME_BUSY" });
	else
		await expect(send).rejects.toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			message: "Agent is busy. No message was sent. Wait for the current turn to finish.",
		});
});

test("an unconfirmed host delivery cannot return success", async () => {
	await expect(
		prepareSend(
			context(),
			{ id: "run", text: "Follow up" },
			dependencies(async () => {
				throw Object.assign(new Error("The provider did not confirm its message receipt"), {
					code: "HARNESS_OBSERVATION_TIMEOUT",
				});
			}),
		),
	).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE", message: "The provider did not confirm its message receipt" });
});

test("an explicit custom PTY sends raw input without a hook receipt", async () => {
	let writes = 0;
	const deps = dependencies(
		async () => {
			throw new Error("A custom terminal has no native host adapter");
		},
		{
			deliver: async (_id, messageId, data, requireIdle) => {
				writes++;
				expect(requireIdle).toBe(false);
				expect(Buffer.from(data, "base64").toString()).toBe("\x1b[200~Input\x1b[201~\r");
				return { status: "written", messageId };
			},
		},
	);
	deps.preset = async () => "custom";
	await prepareSend(context(), { id: "run", text: "Input" }, deps);
	expect(writes).toBe(1);
	await expect(
		prepareSend(context(), { id: "run", text: "Automatic input", requireIdle: true }, deps),
	).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE" });
	expect(writes).toBe(1);
});

test("a closed assignment rejects a send before it contacts the runtime", async () => {
	await h.rows(sql`UPDATE agent_runs SET closed_at=now() WHERE id='run'`);
	let inspected = false;
	await expect(
		prepareSend(
			context(),
			{ id: "run", text: "Do more work" },
			dependencies(async () => session(), {
				inspect: async () => {
					inspected = true;
					return session();
				},
			}),
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(inspected).toBe(false);
});
