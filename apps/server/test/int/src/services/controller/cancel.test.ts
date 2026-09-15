import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { inspect } from "../../../../../src/homeImport/inspect.ts";
import { cancel } from "../../../../../src/services/controller/cancel.ts";
import {
	claim,
	complete,
	list,
	recover,
	resolveUnknown,
	retry,
} from "../../../../../src/services/controller/controller.ts";
import { reconcile } from "../../../../../src/services/controller/reconcile.ts";
import { apply } from "../../../../../src/services/nativeMigration/apply.ts";
import { inventory } from "../../../../../src/services/nativeMigration/inventory.ts";
import { seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
const input = {
	id: "unknown-delivery",
	expectedGeneration: 7,
	reason: "The owner workspace is absent. Preserve its receipt as unknown.",
};
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	project = await h.read((tx) => seedRoot(tx, "CANCEL"));
	await h.read((tx) =>
		seedStatus(tx, { projectId: project, name: "Todo", category: "todo", position: 0, isDefault: true }),
	);
	await h.rows(
		sql`INSERT INTO manager_controller_cursors (project_id,activity_id,generation) VALUES (${project},101,7)`,
	);
	await h.rows(
		sql`INSERT INTO manager_dispatches (id,project_id,run_id,terminal_id,session_id,generation,state,events,due_at,error,created_at,updated_at) VALUES ('unknown-delivery',${project},'original-run','original-terminal','original-conversation',7,'unknown','[{"id":100,"ticketId":"original-ticket","action":"ticket.created","actor":{"kind":"human","name":"dana"},"createdAt":"2026-09-10T00:00:00Z"}]'::jsonb,now(),'original transport failure',now(),now())`,
	);
	await h.rebuild();
});
const deliveries = () => h.run((ctx, tx) => list(ctx, tx, { projectId: project }));

test("human cancellation preserves the original delivery and records an unknown receipt", async () => {
	const original = (await deliveries())[0]!;
	const result = await h.run((ctx, tx) => cancel(ctx, tx, input));
	expect(result).toMatchObject({
		...original,
		state: "cancelled",
		resolution: {
			kind: "cancelled",
			receipt: "unknown",
			generation: 7,
			reason: input.reason,
			actor: { kind: "human", name: "dana" },
		},
	});
	expect(result.resolution?.at).toBeString();
	expect((await deliveries())[0]).toEqual(result);
});

test("an agent or stale generation cannot cancel an unknown delivery", async () => {
	await expect(
		h.run((ctx, tx) => cancel(ctx, tx, input), { actor: { kind: "agent", name: "worker" } }),
	).rejects.toMatchObject({ data: { issues: [{ message: expect.stringContaining("person") }] } });
	await expect(h.run((ctx, tx) => cancel(ctx, tx, { ...input, expectedGeneration: 6 }))).rejects.toMatchObject({
		data: { issues: [{ message: expect.stringContaining("generation") }] },
	});
	expect((await deliveries())[0]).toMatchObject({
		state: "unknown",
		resolution: null,
		error: "original transport failure",
	});
});

test("late completion, recovery, receipt reconciliation, and retry cannot revive a cancellation", async () => {
	await h.run((ctx, tx) => cancel(ctx, tx, input));
	await h.run((ctx, tx) => complete(ctx, tx, { id: input.id, generation: 7, state: "sent", error: null }));
	await h.run((ctx, tx) => recover(ctx, tx, {}));
	await h.run((ctx, tx) => reconcile(ctx, tx));
	await expect(h.run((ctx, tx) => retry(ctx, tx, { id: input.id }))).rejects.toThrow();
	await expect(h.run((ctx, tx) => resolveUnknown(ctx, tx, { id: input.id }))).rejects.toThrow();
	expect(await h.run((ctx, tx) => claim(ctx, tx, {}))).toBeNull();
	expect((await deliveries())[0]).toMatchObject({
		state: "cancelled",
		generation: 7,
		error: "original transport failure",
		resolution: { receipt: "unknown", reason: input.reason },
	});
});

test("only one concurrent cancellation can set the immutable reason", async () => {
	const outcomes = await Promise.allSettled([
		h.run((ctx, tx) => cancel(ctx, tx, input)),
		h.run((ctx, tx) => cancel(ctx, tx, { ...input, reason: "another reason" })),
	]);
	expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
	const winner = outcomes.find((result) => result.status === "fulfilled")!;
	expect((await deliveries())[0]!.resolution?.reason).toBe(
		winner.status === "fulfilled" ? winner.value.resolution?.reason : undefined,
	);
});

test("cancellation returns an old delivery outside the newest queue page", async () => {
	await h.rows(
		sql`INSERT INTO manager_dispatches (id,project_id,state,events,due_at,created_at,updated_at) SELECT 'newer-' || n,${project},'sent','[]'::jsonb,now(),now()+interval '1 day',now() FROM generate_series(1,101) n`,
	);
	expect((await h.run((ctx, tx) => cancel(ctx, tx, input))).id).toBe(input.id);
});

test("native migration keeps a cancelled delivery and no longer treats it as pending work", async () => {
	const before = await h.run((ctx, tx) => inventory(ctx, tx, { project }));
	expect(before.blockers).toEqual(
		expect.arrayContaining([expect.objectContaining({ id: input.id, kind: "delivery" })]),
	);
	await h.run((ctx, tx) => cancel(ctx, tx, input));
	const ready = await h.run((ctx, tx) => inventory(ctx, tx, { project }));
	expect(ready.blockers).toEqual([]);
	expect((await h.read(inspect)).blockers).toEqual([]);
	await h.run((ctx, tx) =>
		apply(ctx, tx, {
			project,
			expectedVersion: ready.version,
			directory: "/tmp/retained",
			requestId: "1638854e-4e0b-4ff5-a89c-c8d22b723b5e",
		}),
	);
	expect((await deliveries())[0]).toMatchObject({ state: "cancelled", resolution: { receipt: "unknown" } });
});
