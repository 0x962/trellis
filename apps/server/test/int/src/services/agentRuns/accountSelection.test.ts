import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

const supersetHome = process.env.SUPERSET_HOME_DIR;
let h: Harness;
let ticket: string;
beforeAll(async () => {
	process.env.SUPERSET_HOME_DIR = join(process.env.TRELLIS_TEST_ROOT!, "superset");
	h = await serviceHarness();
});
afterAll(async () => {
	if (supersetHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = supersetHome;
	await h.close();
});
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "ACCT");
		await seedStatuses(tx, project);
		await tx.execute(
			sql`INSERT INTO personas(id,name,kind,instruction,created_at,updated_at) VALUES ('builder','Builder','builder','Build.',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO harness_accounts(id,name,harness,profile_path,is_default,created_at,updated_at) VALUES ('one','One','claude','/tmp/one',true,now(),now()),('two','Two','codex','/tmp/two',false,now(),now())`,
		);
	});
	await h.rebuild();
	const { create } = await import("../../../../../src/services/tickets.ts");
	ticket = (await h.run((ctx, tx) => create(ctx, tx, { project: "ACCT", title: "Work", status: "In Progress" }))).id;
});
afterEach(() => h.read(assertStatusInvariant));
test("the default account is retained on the assignment", async () => {
	const reserved = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder", requestId: "default" }));
	expect(reserved.run.accountId).toBe("one");
});
test("an explicit account chooses its harness and request replay rejects another account", async () => {
	const input = { ticket, personaId: "builder", requestId: "explicit", accountId: "two" };
	const reserved = await h.run((ctx, tx) => reserve(ctx, tx, input));
	expect(reserved.run.accountId).toBe("two");
	if (reserved.replay) throw new Error("Expected a new attempt");
	expect(reserved.config.harness.preset).toBe("codex");
	expect((await h.run((ctx, tx) => reserve(ctx, tx, input))).replay).toBe(true);
	await expect(h.run((ctx, tx) => reserve(ctx, tx, { ...input, accountId: "one" }))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});
test("a disabled account does not create an assignment", async () => {
	await h.read((tx) => tx.execute(sql`UPDATE harness_accounts SET enabled=false WHERE id='two'`));
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder", accountId: "two" })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test.each([
	[undefined, "anthropic/claude-sonnet-5"],
	["two", "openai/gpt-5.6-sol"],
])("an explicit model survives account selection (%s)", async (accountId, model) => {
	const input = { ticket, personaId: "builder", requestId: "model", accountId, model };
	const reserved = await h.run((ctx, tx) => reserve(ctx, tx, input));
	if (reserved.replay) throw new Error("Expected a new attempt");
	expect(reserved.config.harness.model).toBe(model);
	expect((await h.run((ctx, tx) => reserve(ctx, tx, input))).replay).toBe(true);
	const project = await h.one(sql`SELECT manager_config FROM projects WHERE key='ACCT'`);
	expect((project.manager_config as { harness?: { model?: string } }).harness?.model).toBeUndefined();
});

test("an omitted model uses the project model", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{harness}','{"preset":"claude","model":"anthropic/claude-opus-5"}') WHERE key='ACCT'`,
	);
	const reserved = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder" }));
	if (reserved.replay) throw new Error("Expected a new attempt");
	expect(reserved.config.harness.model).toBe("anthropic/claude-opus-5");
});

test("custom commands reject a model override before assignment", async () => {
	await h.rows(sql`UPDATE harness_accounts SET is_default=false`);
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{harness}','{"preset":"custom","startCommand":"echo {{prompt}}","resumeCommand":"echo {{resumeText}}"}') WHERE key='ACCT'`,
	);
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder", model: "anthropic/claude-sonnet-5" })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect((await h.one(sql`SELECT count(*)::int AS count FROM agent_runs`)).count).toBe(0);
});

test("stored native model names become canonical and incompatible overrides reserve nothing", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{harness}','{"preset":"claude","model":"claude-sonnet-4-6"}') WHERE key='ACCT'`,
	);
	await expect(
		h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder", model: "openai/gpt-6-astra" })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect((await h.one(sql`SELECT count(*)::int AS count FROM agent_runs`)).count).toBe(0);
	const reserved = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId: "builder" }));
	if (reserved.replay) throw new Error("Expected a new attempt");
	expect(reserved.config.harness.model).toBe("anthropic/claude-sonnet-4.6");
});
