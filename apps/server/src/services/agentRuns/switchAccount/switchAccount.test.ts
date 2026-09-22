import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import { transferSession } from "../../harnessAccounts/transferSession.ts";
import type { IoCtx } from "../../support.ts";
import type { startNative } from "../nativeStart.ts";
import { getRun } from "../queries.ts";
import { prepareSwitchAccount } from "./switchAccount.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: IoCtx;
let home: string;
let stops = 0;
let interrupts = 0;
let launches = 0;
const status = spyOn(HarnessHost.prototype, "status");
const stop = spyOn(HarnessHost.prototype, "stop");
const interrupt = spyOn(HarnessHost.prototype, "interrupt");
const at = new Date("2026-09-21T12:00:00Z");

beforeAll(async () => {
	db = await openTestDb();
	home = await mkdtemp(join(tmpdir(), "trellis-account-test-"));
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	ctx = {
		home,
		actor: { kind: "human", name: "qa" },
		session: null,
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		ghStatus: () => ({ ok: true, user: "qa", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		afterCommit: () => {},
		vacuum: async () => {},
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		background: () => {},
		now: () => at,
		newTx: (action) => db.transaction(action),
		emit: () => {},
		core: {
			actor: { kind: "human", name: "qa" },
			now: at,
			cache,
			actorCache: new Map(),
			session: null,
			reqId: ulid(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://localhost",
		},
	};
}, 30_000);

afterEach(() => {
	stops = 0;
	interrupts = 0;
	launches = 0;
});
afterAll(async () => {
	status.mockRestore();
	stop.mockRestore();
	interrupt.mockRestore();
	await db.$client.close();
	await rm(home, { recursive: true });
});

async function fixture(harness: "claude" | "codex", working = false, exited = false) {
	const id = ulid(),
		accountId = ulid(),
		oldAccountId = ulid(),
		terminalId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();
	const workspace = join(home, id);
	await mkdir(join(home, "harness-attempts", terminalId), { recursive: true });
	await writeFile(join(home, "harness-attempts", terminalId, "launch.json"), JSON.stringify({ harness }));
	await db.execute(sql`INSERT INTO harness_accounts (id,name,harness,profile_path,created_at,updated_at) VALUES
		(${accountId},'Next account',${harness},${join(home, accountId)},${at},${at}),
		(${oldAccountId},'Old account',${harness},${join(home, oldAccountId)},${at},${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_path,harness,account_id,terminal_id,session_id,workspace_id,closed_at,created_at,updated_at)
		VALUES (${id},'switch-test','session','Remember the secret','',${JSON.stringify({ preset: harness })}::jsonb,
		${oldAccountId},${terminalId},${sessionId},${workspace},${exited ? at : null},${at},${at})`);
	let processStatus = exited ? "exited" : "running";
	status.mockImplementation(
		async () =>
			({
				id: terminalId,
				status: processStatus,
				controllable: true,
				agent: { sessionId },
				launch: { cwd: workspace },
				activity: { state: working ? "working" : "idle" },
			}) as RuntimeProcessStatus,
	);
	stop.mockImplementation(async () => {
		stops++;
		processStatus = "exited";
		return status(terminalId);
	});
	interrupt.mockImplementation(async () => {
		interrupts++;
		return status(terminalId);
	});
	const start: typeof startNative = async (_ctx, input) => {
		launches++;
		expect(input.resume).toBe(true);
		expect(input.run.sessionId).toBe(sessionId);
		expect(input.run.workspaceId).toBe(workspace);
		expect(input.run.accountId).toBe(accountId);
		expect(input.previousAccountId).toBe(oldAccountId);
		expect(input.config.harness.preset).toBe(harness);
		expect(input.config.directory).toBe(workspace);
		return { id, launchedAt: at.toISOString() };
	};
	return {
		id,
		accountId,
		oldAccountId,
		terminalId,
		sessionId,
		start,
		input: { id, accountId, expectedTerminalId: terminalId, requestId: crypto.randomUUID(), confirmInterrupt: true },
	};
}

for (const harness of ["claude", "codex"] as const) {
	test(`${harness}: copies the complete conversation between separate profiles without credentials`, async () => {
		const from = join(home, ulid()),
			to = join(home, ulid()),
			sessionId = crypto.randomUUID();
		const directory = harness === "claude" ? "projects/scratch" : "sessions/2026/09/21";
		const filename = harness === "claude" ? `${sessionId}.jsonl` : `rollout-2026-09-21-${sessionId}.jsonl`;
		await mkdir(join(from, directory), { recursive: true });
		await mkdir(to);
		await writeFile(join(from, directory, filename), "first prompt\nfirst answer\n");
		await writeFile(join(from, "auth.json"), "source login");
		await writeFile(join(to, "auth.json"), "target login");
		const transfer = { harness, from, to, sessionId, cwd: home, env: {}, directory: join(home, "transfer") };
		await transferSession(transfer);
		expect(await readFile(join(to, directory, filename), "utf8")).toBe("first prompt\nfirst answer\n");
		expect(await readFile(join(to, "auth.json"), "utf8")).toBe("target login");
		await writeFile(join(to, directory, filename), "first prompt\nfirst answer\nnext message\n");
		await transferSession({ ...transfer, from: to, to: from });
		expect(await readFile(join(from, directory, filename), "utf8")).toContain("next message");
	});
	for (const exited of [false, true]) {
		test(`${harness}: switches an ${exited ? "exited" : "idle"} independent session and preserves its identity`, async () => {
			const f = await fixture(harness, false, exited);
			await prepareSwitchAccount(ctx, f.input, f.start);
			const run = await ctx.newTx((tx) => getRun(tx, f.id));
			expect(run.accountId).toBe(f.accountId);
			expect(run.sessionId).toBe(f.sessionId);
			expect(run.terminalId).not.toBe(f.terminalId);
			expect(run.switchedTo).toBe("Next account");
			expect(stops).toBe(exited ? 0 : 1);
			expect(interrupts).toBe(0);
			await prepareSwitchAccount(ctx, f.input, f.start);
			expect(launches).toBe(1);
		});
	}
}

test("preserves the workspace of a session in a project without a directory", async () => {
	const f = await fixture("claude");
	const projectId = ulid();
	await db.execute(sql`INSERT INTO projects (id,root_id,key,slug,name,created_at,updated_at)
		VALUES (${projectId},${projectId},'QA','qa','QA',${at},${at})`);
	await db.execute(sql`UPDATE agent_runs SET project_id=${projectId} WHERE id=${f.id}`);
	await db.transaction((tx) => ctx.core.cache.rebuild(tx));
	await prepareSwitchAccount(ctx, f.input, f.start);
	expect(launches).toBe(1);
});

test("requires confirmation before it interrupts a running turn", async () => {
	const f = await fixture("claude", true);
	await expect(prepareSwitchAccount(ctx, { ...f.input, confirmInterrupt: false }, f.start)).rejects.toThrow("Confirm");
	expect(stops).toBe(0);
	expect(interrupts).toBe(0);
	await prepareSwitchAccount(ctx, f.input, f.start);
	expect(interrupts).toBe(1);
	expect(stops).toBe(1);
});

test("rejects another harness before it stops the current process", async () => {
	const f = await fixture("claude");
	await db.execute(sql`UPDATE harness_accounts SET harness='codex' WHERE id=${f.accountId}`);
	await expect(prepareSwitchAccount(ctx, f.input, f.start)).rejects.toThrow("same harness");
	expect(stops).toBe(0);
	expect((await ctx.newTx((tx) => getRun(tx, f.id))).accountId).toBe(f.oldAccountId);
});

test("rejects a stale attempt before it stops the current process", async () => {
	const f = await fixture("codex");
	await expect(prepareSwitchAccount(ctx, { ...f.input, expectedTerminalId: "stale" }, f.start)).rejects.toThrow(
		"another attempt",
	);
	expect(stops).toBe(0);
});

test("does not report a successful switch when the launch fails", async () => {
	const f = await fixture("claude");
	await prepareSwitchAccount(ctx, f.input, async () => ({ id: f.id }));
	expect((await ctx.newTx((tx) => getRun(tx, f.id))).switchedTo).toBeNull();
});

test("refuses concurrent process changes for the same run", async () => {
	const f = await fixture("codex");
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	let entered!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const first = prepareSwitchAccount(ctx, f.input, async (...args) => {
		entered();
		await pending;
		return f.start(...args);
	});
	await started;
	await expect(prepareSwitchAccount(ctx, { ...f.input, requestId: crypto.randomUUID() }, f.start)).rejects.toThrow(
		"Another operation",
	);
	finish();
	await first;
	expect(launches).toBe(1);
});
