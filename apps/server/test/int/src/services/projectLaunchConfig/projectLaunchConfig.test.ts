import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { reserveRestart } from "../../../../../src/services/restartAgents/reserveRestart.ts";
import { seedActors, seedChild, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let root: string;
let child: string;
let grandchild: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		root = await seedRoot(tx, "ROOT", {
			manager_config: { personaId: null, concurrency: 9, directory: "/tmp/root", harness: { preset: "codex" } },
		});
		await seedStatuses(tx, root);
		child = await seedChild(tx, root, root, "child");
		grandchild = await seedChild(tx, child, root, "leaf");
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('manager','Manager','manager','Manage.',now(),now())`,
		);
	});
	await h.rebuild();
});
const reservation = (project: string) => h.run((ctx, tx) => reserve(ctx, tx, { project, personaId: "manager" }));

test("a child launch uses the nearest current ancestor directory without inheriting other settings", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{directory}','"/tmp/changed-root"') WHERE id=${root}`,
	);
	const first = await reservation(child);
	if (first.replay) throw new Error("Expected a new launch");
	expect(first.config.directory).toBe("/tmp/changed-root");
	expect(first.config.concurrency).toBe(3);
	expect(first.config.personaId).toBeNull();
	expect(first.config.harness.preset).toBe("claude");
	expect(first.context).toContain("Project directory: /tmp/changed-root");
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{directory}','"/tmp/nearer"') WHERE id=${child}`,
	);
	const next = await reservation(grandchild);
	if (next.replay) throw new Error("Expected a new launch");
	expect(next.config.directory).toBe("/tmp/nearer");
});

test("an explicit child directory takes precedence over ancestor directories", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{directory}','"/tmp/child"') WHERE id=${child}`,
	);
	const result = await reservation(child);
	if (result.replay) throw new Error("Expected a new launch");
	expect(result.config.directory).toBe("/tmp/child");
});

test("restart preparation resolves the inherited directory and keeps the saved session model", async () => {
	const first = await reservation(child);
	if (first.replay) throw new Error("Expected a new launch");
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{directory}','"/tmp/restart-root"') WHERE id=${root}`,
	);
	const result = await h.run((ctx, tx) =>
		reserveRestart(
			ctx,
			tx,
			{
				runId: first.run.id,
				previousAttemptId: first.attempt.id,
				providerSessionId: "saved-session",
				harness: "claude",
				model: "anthropic/claude-sonnet-5",
				workspace: "/tmp/saved-workspace",
				processIdentity: "identity",
				attempt: { id: "restart-attempt", token: "restart-token" },
			},
			false,
		),
	);
	expect(result?.config.directory).toBe("/tmp/restart-root");
	expect(result?.config.harness.model).toBe("anthropic/claude-sonnet-5");
});

test("a child launch uses the nearest ancestor account, and a manager restart moves to the project account", async () => {
	const account = "01M00000000000000000000A11";
	await h.rows(
		sql`INSERT INTO harness_accounts (id, name, harness, profile_path, enabled, created_at, updated_at)
		VALUES (${account}, 'Root account', 'codex', '/tmp/trellis-root-account', true, now(), now())`,
	);
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{accountId}',${JSON.stringify(account)}::jsonb) WHERE id=${root}`,
	);
	const child_ = await reservation(grandchild);
	expect(child_.run.accountId).toBe(account);
	const own = await reservation(root);
	expect(own.run.accountId).toBe(account);
});
