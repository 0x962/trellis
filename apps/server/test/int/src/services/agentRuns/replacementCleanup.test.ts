import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { startNative } from "../../../../../src/services/agentRuns/nativeStart.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "CLEAN");
		await seedStatuses(tx, project);
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES ('persona','Manager','manager','Manage.',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_id,persona_name,kind,instruction,project_id,project_path,terminal_id,workspace_id,closed_at,created_at,updated_at) VALUES ('manager','Manager','native','persona','Manager','manager','Manage.',${project},'CLEAN','previous','/tmp',now(),now(),now())`,
		);
	});
	await h.rebuild();
});
afterEach(() => h.read(assertStatusInvariant));

test.each([false, true])(
	"a closed manager cannot replace an unconfirmed process with newSession=%s",
	async (newSession) => {
		await expect(
			h.run((ctx, tx) => reserve(ctx, tx, { project: "CLEAN", personaId: "persona", newSession })),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
		expect((await h.rows(sql`SELECT terminal_id FROM agent_runs WHERE id='manager'`))[0]!.terminal_id).toBe("previous");
		expect((await h.rows(sql`SELECT count(*)::int AS count FROM agent_execution_attempts`))[0]!.count).toBe(0);
	},
);

test.each([false, true])("confirmed cleanup permits a manager reservation with newSession=%s", async (newSession) => {
	const result = await h.run((ctx, tx) =>
		reserve(ctx, tx, { project: "CLEAN", personaId: "persona", newSession }, ["previous"]),
	);
	expect(result.replay).toBe(false);
	expect(result.run.terminalId).not.toBe("previous");
});

test.each(["harness", "workspace"] as const)(
	"a known %s failure before launch permits a corrected manager assignment",
	async (failure) => {
		await h.rows(sql`UPDATE agent_runs SET closed_at=NULL WHERE id='manager'`);
		const ctx = {
			...h.ctx(() => {}),
			newTx: h.read,
			home: "/tmp/unused",
			now: () => new Date(),
			localUrl: "http://127.0.0.1:4521",
		} as unknown as Parameters<typeof startNative>[0];
		await startNative(
			ctx,
			{
				run: await h.read((tx) => getRun(tx, "manager")),
				config: ProjectManagerConfigSchema.parse({
					personaId: null,
					directory: "/tmp",
					harness: {
						preset: failure === "harness" ? "custom" : "claude",
						startCommand: "/bin/cat",
						resumeCommand: "/bin/cat",
					},
				}),
				resume: false,
				context: "Assignment",
				attempt: { id: "previous", generation: 1, token: "token" },
			},
			{
				env: {},
				workspace: async () => {
					throw new Error("Missing workspace");
				},
			},
		);
		const failed = await h.read((tx) => getRun(tx, "manager"));
		expect(failed.terminalId).toBeNull();
		expect(failed.closedAt).not.toBeNull();
		const corrected = await h.run((core, tx) =>
			reserve(core, tx, { project: "CLEAN", personaId: "persona", newSession: true }),
		);
		expect(corrected.replay).toBe(false);
		expect(corrected.run.terminalId).not.toBe("previous");
	},
);
