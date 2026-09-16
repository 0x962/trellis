import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type RestartPlan, readRestartPlan, writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { prepareResumeRestart } from "../../../../../src/services/restartAgents/restartAgents.ts";
import { seedActors, seedChild, seedRoot } from "../../../../fixtures/projects.ts";
import {
	type RestartLaunch,
	recordRestartLaunch,
	restartResumeContext,
	stubRestartHost,
} from "../../../../helpers/restartResume.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let harness: Harness;
let home: string;
let plan: RestartPlan;
let processes: RuntimeProcessStatus[];
let launches: RestartLaunch[];
let parentRunId: string;
let childRunId: string;
let parentProjectId: string;
let childProjectId: string;
let failOnce: string | null;

beforeAll(async () => {
	harness = await serviceHarness();
});

afterAll(() => harness.close());

beforeEach(async () => {
	await harness.reset();
	home = await mkdtemp(join(process.env.TRELLIS_TEST_ROOT!, "manager-restart-"));
	parentRunId = ulid();
	childRunId = ulid();
	const personaId = ulid();
	const parentPrevious = randomUUID();
	const childPrevious = randomUUID();
	await harness.read(async (tx) => {
		await seedActors(tx);
		parentProjectId = await seedRoot(tx, "MGR");
		childProjectId = await seedChild(tx, parentProjectId, parentProjectId, "child");
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Manager','manager','Coordinate the project.',now(),now())`,
		);
		await tx.execute(
			sql`UPDATE projects SET manager_config=${JSON.stringify({ personaId, concurrency: 3, directory: "/tmp/parent-work", harness: { preset: "codex" } })}::jsonb WHERE id=${parentProjectId}`,
		);
		await tx.execute(
			sql`UPDATE projects SET manager_config=${JSON.stringify({ personaId, concurrency: 2, directory: "/tmp/child-work", harness: { preset: "codex" } })}::jsonb WHERE id=${childProjectId}`,
		);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_id,persona_name,kind,instruction,project_id,project_path,terminal_id,session_id,workspace_id,created_at,updated_at) VALUES
			(${parentRunId},'Manager','native',${personaId},'Manager','manager','Coordinate the project.',${parentProjectId},'MGR',${parentPrevious},'provider-parent','/tmp/parent-work',now(),now()),
			(${childRunId},'Manager','native',${personaId},'Manager','manager','Coordinate the project.',${childProjectId},'MGR.child',${childPrevious},'provider-child','/tmp/child-work',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO manager_delegations (run_id,parent_run_id,project_id,capacity,brief,created_at) VALUES (${childRunId},${parentRunId},${childProjectId},2,'Own the child project.',now())`,
		);
	});
	plan = {
		version: 1,
		id: randomUUID(),
		sourceReleaseId: "current",
		targetReleaseId: "current",
		createdAt: new Date().toISOString(),
		sessions: [
			{
				runId: parentRunId,
				previousAttemptId: parentPrevious,
				providerSessionId: "provider-parent",
				harness: "codex",
				workspace: "/tmp/parent-work",
				processIdentity: "process-parent",
				attempt: { id: randomUUID(), token: "token-parent" },
			},
			{
				runId: childRunId,
				previousAttemptId: childPrevious,
				providerSessionId: "provider-child",
				harness: "codex",
				workspace: "/tmp/child-work",
				processIdentity: "process-child",
				attempt: { id: randomUUID(), token: "token-child" },
			},
		],
	};
	processes = plan.sessions.map(
		(entry) =>
			({
				id: entry.previousAttemptId,
				status: "exited",
				controllable: false,
				agent: { sessionId: entry.providerSessionId, outcome: "interrupted" },
				activity: { state: "working", updatedAt: new Date().toISOString() },
				result: null,
				acknowledgedMessageIds: [],
				error: null,
			}) as unknown as RuntimeProcessStatus,
	);
	launches = [];
	failOnce = null;
	await writeRestartPlan(home, plan);
});

afterEach(async () => {
	await harness.read(assertStatusInvariant);
	await rm(home, { recursive: true, force: true });
});

const context = () => restartResumeContext(harness, home);

const dependencies = () => ({
	host: stubRestartHost(processes),
	start: async (_ctx: unknown, input: RestartLaunch) => {
		if (failOnce === input.run.id) {
			failOnce = null;
			launches.push(input);
			throw new Error("The restoration was interrupted.");
		}
		return recordRestartLaunch(processes, launches, input);
	},
});

test("restart restores every manager and preserves the delegated project state", async () => {
	expect(await prepareResumeRestart(context(), { restartId: plan.id, wait: true }, dependencies())).toMatchObject({
		resumed: 2,
		skipped: 0,
		failed: 0,
	});
	const runs = await harness.rows(
		sql`SELECT id,project_id,project_path,terminal_id,session_id,workspace_id,closed_at FROM agent_runs ORDER BY project_path`,
	);
	expect(runs).toEqual([
		{
			id: parentRunId,
			project_id: parentProjectId,
			project_path: "MGR",
			terminal_id: plan.sessions[0]!.attempt.id,
			session_id: "provider-parent",
			workspace_id: "/tmp/parent-work",
			closed_at: null,
		},
		{
			id: childRunId,
			project_id: childProjectId,
			project_path: "MGR.child",
			terminal_id: plan.sessions[1]!.attempt.id,
			session_id: "provider-child",
			workspace_id: "/tmp/child-work",
			closed_at: null,
		},
	]);
	expect(
		await harness.rows(sql`SELECT run_id,parent_run_id,project_id,capacity,brief,retired_at FROM manager_delegations`),
	).toEqual([
		{
			run_id: childRunId,
			parent_run_id: parentRunId,
			project_id: childProjectId,
			capacity: 2,
			brief: "Own the child project.",
			retired_at: null,
		},
	]);
	expect(await prepareResumeRestart(context(), { restartId: plan.id, wait: true }, dependencies())).toMatchObject({
		resumed: 0,
		skipped: 0,
		failed: 0,
	});
	expect(launches).toHaveLength(2);
	expect(await harness.rows(sql`SELECT id FROM agent_runs WHERE kind='manager' AND closed_at IS NULL`)).toHaveLength(2);
});

test("an interrupted manager restore keeps partial progress and retries without duplicates", async () => {
	failOnce = childRunId;
	expect(await prepareResumeRestart(context(), { restartId: plan.id, wait: true }, dependencies())).toMatchObject({
		resumed: 1,
		skipped: 0,
		failed: 1,
	});
	const pending = await readRestartPlan(home);
	expect(pending?.sessions.find((entry) => entry.runId === parentRunId)).toMatchObject({
		done: true,
		outcome: "resumed",
	});
	expect(pending?.sessions.find((entry) => entry.runId === childRunId)?.error).toBe("The restoration was interrupted.");
	expect(await prepareResumeRestart(context(), { restartId: plan.id, wait: true }, dependencies())).toMatchObject({
		resumed: 1,
		skipped: 0,
		failed: 0,
	});
	expect(await readRestartPlan(home)).toBeNull();
	expect(launches.filter((launch) => launch.run.id === parentRunId)).toHaveLength(1);
	expect(launches.filter((launch) => launch.run.id === childRunId)).toHaveLength(2);
	expect(await harness.rows(sql`SELECT id FROM agent_execution_attempts`)).toHaveLength(2);
	expect(await harness.rows(sql`SELECT id FROM agent_runs WHERE kind='manager' AND closed_at IS NULL`)).toHaveLength(2);
});
