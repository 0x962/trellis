import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { reserveAttempt } from "../../../../../src/services/assignments/attempts.ts";
import { file } from "../../../../../src/services/evidence/file.ts";
import { list } from "../../../../../src/services/evidence/list.ts";
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
	await rm(home, { recursive: true, force: true });
});

afterAll(() => h.close());

test("evidence lists historical checks and current artifacts without readiness", async () => {
	const artifact = await register(ctx, { runId, path: "code.ts" });
	const document = {
		id: "historical-check",
		runId,
		attemptId: artifact.attemptId,
		command: "bun",
		args: ["test"],
		timeoutMs: 60_000,
		head: artifact.head,
		fingerprint: artifact.fingerprint,
		state: "passed" as const,
		exitCode: 0,
		output: "1 pass",
		truncated: false,
		error: null,
		finishedFingerprint: artifact.fingerprint,
		createdAt: new Date().toISOString(),
		finishedAt: new Date().toISOString(),
	};
	await h.read((tx) =>
		tx.execute(
			sql`INSERT INTO evidence_checks (id, run_id, attempt_id, document, created_at, finished_at) VALUES (${document.id}, ${runId}, ${document.attemptId}, ${JSON.stringify(document)}::jsonb, ${document.createdAt}, ${document.finishedAt})`,
		),
	);

	const evidence = await list(ctx, { runId });
	expect(evidence).not.toHaveProperty("readyForReview");
	expect(evidence.checks).toEqual([{ ...document, historical: true }]);
	expect(evidence.checks[0]).not.toHaveProperty("current");
	expect(evidence.artifacts[0]).toMatchObject({ id: artifact.id, current: true });

	await writeFile(join(workspace, "code.ts"), "export const value = 2;\n");
	const changed = await list(ctx, { runId });
	expect(changed.checks[0]).toEqual({ ...document, historical: true });
	expect(changed.artifacts[0]!.current).toBe(false);
});

test("a new agent run creates no check row", async () => {
	await register(ctx, { runId, path: "code.ts" });
	expect(await h.rows(sql`SELECT id FROM evidence_checks WHERE run_id=${runId}`)).toEqual([]);
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

test("only the current native attempt can register an artifact as its agent", async () => {
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
});
