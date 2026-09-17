import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dispatchColumns } from "../../../../../src/services/manager/dispatchColumns.ts";
import type { IoCtx } from "../../../../../src/services/support.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
let calls: string[];
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	calls = [];
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "DISP");
		const statuses = await seedStatuses(tx, project);
		await tx.execute(sql`UPDATE statuses SET agent_config='{}'::jsonb WHERE id=${statuses.started}`);
		await seedTicket(tx, { projectId: project, rootId: project, statusId: statuses.started });
	});
	await h.rebuild();
});
const ctx = (): IoCtx => ({
	...testCtx({ db: h.db, home: "/dispatch-fixture" }).ctx,
	core: h.ctx(() => {}),
	localUrl: "http://trellis.test",
	publicUrl: "http://trellis.test",
});
const deps = () => ({
	column: async () => {
		calls.push("worker");
	},
	copilot: async () => {
		calls.push("copilot");
	},
});
test("a failed worker does not prevent copilot recovery", async () => {
	await expect(
		dispatchColumns(ctx(), [], {
			...deps(),
			column: async () => {
				throw new Error("Quota");
			},
		}),
	).rejects.toThrow("Quota");
	expect(calls).toEqual(["copilot"]);
});
test("an archived project receives no copilot start", async () => {
	await h.rows(sql`UPDATE projects SET archived_at=now() WHERE id=${project}`);
	await dispatchColumns(ctx(), [], deps());
	expect(calls).toEqual(["worker"]);
});
test("overlapping beats share each pending launch", async () => {
	const pending = Promise.withResolvers<void>();
	const started = Promise.withResolvers<void>();
	const dependencies = {
		...deps(),
		column: async () => {
			calls.push("worker");
			started.resolve();
			await pending.promise;
		},
	};
	const first = dispatchColumns(ctx(), [], dependencies);
	await started.promise;
	const second = dispatchColumns(ctx(), [], dependencies);
	await new Promise((resolve) => setTimeout(resolve, 20));
	pending.resolve();
	await Promise.all([first, second]);
	expect(calls.filter((call) => call === "worker")).toHaveLength(1);
});
