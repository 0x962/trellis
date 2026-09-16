import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let ticket: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
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
	ticket = (await h.run((ctx, tx) => create(ctx, tx, { project: "ACCT", title: "Work" }))).id;
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
