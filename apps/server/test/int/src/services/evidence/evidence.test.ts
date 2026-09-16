import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { nativeClient } from "../../../../../src/agents/native/connection.ts";
import { reserveAttempt } from "../../../../../src/services/assignments/attempts.ts";
import { check } from "../../../../../src/services/evidence/check.ts";
import { file } from "../../../../../src/services/evidence/file.ts";
import { list } from "../../../../../src/services/evidence/list.ts";
import { recover } from "../../../../../src/services/evidence/recover.ts";
import { register } from "../../../../../src/services/evidence/register.ts";
import type { EvidenceCtx } from "../../../../../src/services/evidence/types.ts";
import { seedRoot } from "../../../../fixtures/projects.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let home: string;
let workspace: string;
let runId: string;
let ctx: EvidenceCtx;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(async () => {
	await h.reset();
	home = await mkdtemp(join(tmpdir(), "trellis-evidence-service-"));
	workspace = join(home, "workspace");
	await mkdir(workspace);
	execFileSync("git", ["init", "-q", workspace]);
	await writeFile(join(workspace, "code.ts"), "export const value = 1;\n");
	await writeFile(join(workspace, ".gitignore"), "ignored/\n");
	execFileSync("git", ["-C", workspace, "add", "."]);
	execFileSync("git", [
		"-C",
		workspace,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.test",
		"commit",
		"-qm",
		"Fixture",
	]);
	runId = ulid();
	await h.read(async (tx) => {
		const project = await seedRoot(tx, "EVD");
		await tx.execute(
			sql`INSERT INTO agent_runs (id, name, runtime, persona_name, kind, instruction, project_id, project_path, workspace_id, terminal_id, created_at, updated_at) VALUES (${runId}, 'Fixture', 'native', 'Builder', 'builder', '', ${project}, 'evd', ${workspace}, ${randomUUID()}, now(), now())`,
		);
	});
	await h.rebuild();
	ctx = { ...testCtx({ db: h.db, home }).ctx, core: h.ctx(() => {}) };
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	const daemon = await nativeClient(home)
		.hello()
		.catch(() => null);
	if (daemon) process.kill(daemon.pid, "SIGTERM");
	await Bun.sleep(100);
	await rm(home, { recursive: true, force: true });
});
afterAll(() => h.close());
const command = (source: string, requestId = randomUUID()) => ({
	runId,
	requestId,
	command: process.execPath,
	args: ["-e", source],
	timeoutMs: 3000,
});

test("current artifacts and checks permit review, then same-HEAD changes invalidate both", async () => {
	await register(ctx, { runId, path: "code.ts" });
	const input = command('process.stdout.write("verified")');
	const passed = await check(ctx, input);
	expect(passed).toMatchObject({ state: "passed", output: "verified", current: true });
	const history = await list(ctx, { runId });
	expect(history).not.toHaveProperty("readyForReview");
	expect(history.checks[0]).toMatchObject({ historical: true, state: "passed", output: "verified" });
	expect(history.checks[0]).not.toHaveProperty("current");
	await writeFile(join(workspace, "code.ts"), "export const value = 2;\n");
	const stale = await list(ctx, { runId });
	expect(stale.head).toBe(passed.head);
	expect(stale.readyForReview).toBe(false);
	expect(stale.artifacts[0]!.current).toBe(false);
	expect(stale.checks[0]!.current).toBe(false);
	const replay = await check(ctx, input);
	expect(replay).toMatchObject({ id: passed.id, state: "passed", current: false, finishedAt: passed.finishedAt });
	expect((await nativeClient(home).list()).length).toBe(1);
	await expect(check(ctx, { ...input, args: ["-e", "process.exit(7)"] })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});

test("check timeout and bounded output persist without a shell", async () => {
	const failed = await check(ctx, command('process.stdout.write("x".repeat(300000) + "tail"); process.exitCode=3'));
	expect(failed.state).toBe("failed");
	expect(failed.exitCode).toBe(3);
	expect(failed.output.length).toBe(262144);
	expect(failed.output.endsWith("tail")).toBe(true);
	expect(failed.truncated).toBe(true);
	const timeout = await check(ctx, { ...command("setInterval(() => {}, 1000)"), timeoutMs: 100 });
	expect(timeout.state).toBe("timed_out");
	expect(timeout.error).toBe("Process timed out after 100 ms");
	expect((await list(ctx, { runId })).readyForReview).toBe(false);
});

test("file preview and artifact registration reject paths outside the workspace", async () => {
	await writeFile(join(home, "secret.txt"), "secret");
	await symlink(join(home, "secret.txt"), join(workspace, "escape.txt"));
	await expect(file(ctx, { runId, path: "escape.txt" })).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(register(ctx, { runId, path: "../secret.txt" })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect(await file(ctx, { runId, path: "code.ts" })).toMatchObject({
		text: "export const value = 1;\n",
		binary: false,
		truncated: false,
	});
	await mkdir(join(workspace, "ignored"));
	await writeFile(join(workspace, "ignored", "artifact.txt"), "ignored");
	await expect(register(ctx, { runId, path: "ignored/artifact.txt" })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});

test("paused local work rejects checks before a runtime launch", async () => {
	await h.read((tx) =>
		tx.execute(sql`INSERT INTO settings (key, value, updated_at) VALUES ('nativeWorkPaused', 'true', now())`),
	);
	await expect(check(ctx, command("process.exit(0)"))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect((await h.rows(sql`SELECT id FROM evidence_checks`)).length).toBe(0);
	await expect(nativeClient(home).hello()).rejects.toMatchObject({ code: "ENOENT" });
});

test("a repeated check settles a confirmed exit after host recovery without another launch", async () => {
	const input = command("process.exit(0)");
	const passed = await check(ctx, input);
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE evidence_checks SET finished_at=NULL, document=jsonb_set(jsonb_set(document, '{state}', '"starting"'), '{finishedAt}', 'null') WHERE id=${passed.id}`,
		),
	);
	await h.run(recover);
	const replay = await check(ctx, input);
	expect(replay).toMatchObject({ state: "passed", id: passed.id, exitCode: 0, current: true });
	expect((await nativeClient(home).list()).length).toBe(1);
	expect((await list(ctx, { runId })).readyForReview).toBe(false);
});

test("evidence reads retain uncertainty until the runtime confirms the same check exited", async () => {
	const passed = await check(ctx, command('process.stdout.write("confirmed result")'));
	const missingId = randomUUID();
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE evidence_checks SET id=${missingId}, document=document || ${JSON.stringify({ id: missingId, state: "unknown", error: "Unconfirmed exit", output: "", exitCode: null, finishedFingerprint: null })}::jsonb WHERE id=${passed.id}`,
		),
	);
	expect((await list(ctx, { runId })).checks[0]).toMatchObject({ state: "unknown", error: "Unconfirmed exit" });
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE evidence_checks SET id=${passed.id}, document=jsonb_set(document, '{id}', ${JSON.stringify(passed.id)}::jsonb) WHERE id=${missingId}`,
		),
	);
	expect((await list(ctx, { runId })).checks[0]).toMatchObject({
		state: "passed",
		output: "confirmed result",
		current: true,
	});
	expect((await nativeClient(home).list()).length).toBe(1);
});

test("the display limit cannot hide a failed check from review readiness", async () => {
	await register(ctx, { runId, path: "code.ts" });
	const passed = await check(ctx, command("process.exit(0)"));
	await h.read(async (tx) => {
		await tx.execute(
			sql`INSERT INTO evidence_checks (id, run_id, attempt_id, document, created_at, finished_at) SELECT 'failed-hidden', run_id, attempt_id, document || '{"id":"failed-hidden","command":"required-check","state":"failed","exitCode":1}'::jsonb, created_at - interval '1 hour', finished_at FROM evidence_checks WHERE id=${passed.id}`,
		);
		await tx.execute(
			sql`INSERT INTO evidence_checks (id, run_id, attempt_id, document, created_at, finished_at) SELECT 'extra-' || n, run_id, attempt_id, document || jsonb_build_object('id', 'extra-' || n), created_at, finished_at FROM evidence_checks CROSS JOIN generate_series(1, 101) n WHERE id=${passed.id}`,
		);
	});
	const evidence = await list(ctx, { runId });
	expect(evidence.checks).toHaveLength(100);
	expect(evidence.readyForReview).toBe(false);
});

test("a check that changes workspace contents cannot provide current passing evidence", async () => {
	const result = await check(ctx, command('await Bun.write("code.ts", "changed by check")'));
	expect(result.state).toBe("passed");
	expect(result.current).toBe(false);
	expect(result.finishedFingerprint).not.toBe(result.fingerprint);
});

test("only the current native attempt can register evidence as its agent", async () => {
	const first = await h.run((core, tx) => reserveAttempt(core, tx, { runId }));
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET terminal_id=${first.id} WHERE id=${runId}`));
	const agent = {
		...ctx,
		core: { ...ctx.core, actor: { kind: "agent" as const, name: runId }, attemptToken: first.token },
	};
	expect((await register(agent, { runId, path: "code.ts" })).current).toBe(true);
	const next = await h.run((core, tx) => reserveAttempt(core, tx, { runId }));
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET terminal_id=${next.id} WHERE id=${runId}`));
	await expect(register(agent, { runId, path: "code.ts" })).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(check(agent, command("process.exit(0)"))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect((await h.rows(sql`SELECT id FROM evidence_checks`)).length).toBe(0);
});

test("concurrent requests reserve one check and launch one process", async () => {
	const input = command('await Bun.sleep(100); process.stdout.write("once")');
	const results = await Promise.all([check(ctx, input), check(ctx, input)]);
	expect(results[0]!.id).toBe(results[1]!.id);
	expect(results.some((result) => result.state === "passed")).toBe(true);
	expect((await nativeClient(home).list()).length).toBe(1);
	expect((await h.rows(sql`SELECT id FROM evidence_checks`)).length).toBe(1);
});
