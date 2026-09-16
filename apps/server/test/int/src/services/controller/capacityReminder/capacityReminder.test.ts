import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { DEFAULT_PROJECT_MANAGER_CONFIG } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { capacityAvailable } from "../../../../../../src/services/assignments/capacity.ts";
import { capacityReminder } from "../../../../../../src/services/controller/capacityReminder/capacityReminder.ts";
import { coordination } from "../../../../../../src/services/controller/coordination.ts";
import { insertRow, seedChild, seedRoot, seedStatus } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../../helpers/controllerSession.ts";
import { type Harness, NOW, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let projectId: string;
let statusId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		projectId = await seedRoot(tx, "CAP", {
			manager_config: { ...DEFAULT_PROJECT_MANAGER_CONFIG, personaId: ulid(), concurrency: 3 },
		});
		statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
	});
});
const ticket = (project = projectId) =>
	h.read((tx) => seedTicket(tx, { projectId: project, rootId: projectId, statusId }));
const worker = (id: string, project = projectId, overrides: Record<string, unknown> = {}) =>
	h.read((tx) =>
		insertRow(tx, "agent_runs", {
			id,
			name: id,
			persona_name: "Builder",
			kind: "builder",
			instruction: "Build",
			project_id: project,
			project_path: "CAP",
			runtime: "native",
			created_at: NOW,
			updated_at: NOW,
			...overrides,
		}),
	);
const reminder = () => h.read((tx) => capacityReminder(tx, { projectId }));

test("a heartbeat exposes unused slots while tickets remain unfinished", async () => {
	await ticket();
	await ticket();
	await ticket();
	await worker("worker");
	await worker("manager", projectId, { kind: "manager" });
	const context = await h.read((tx) => coordination(tx, { id: "dispatch", projectId }));
	expect(context.capacityReminder).toMatchObject({
		type: "below_worker_capacity",
		freeSlots: 2,
		unfinishedTickets: 3,
		projects: [{ projectId, workerLimit: 3, occupiedSlots: 1, freeSlots: 2, unfinishedTickets: 3 }],
	});
});

test("full capacity and an empty backlog omit the reminder", async () => {
	expect(await reminder()).toBeNull();
	await ticket();
	for (const id of ["one", "two", "three"]) await worker(id);
	expect(await reminder()).toBeNull();
	await h.rows(sql`UPDATE agent_runs SET closed_at=${NOW} WHERE id='one'`);
	expect(await reminder()).toMatchObject({ freeSlots: 1, unfinishedTickets: 1 });
});

test("done and canceled tickets do not count as unfinished work", async () => {
	for (const category of ["done", "canceled"] as const)
		await h.read(async (tx) => {
			const status = await seedStatus(tx, { projectId, name: category, category, position: 1 });
			await seedTicket(tx, { projectId, rootId: projectId, statusId: status, completedAt: NOW });
		});
	expect(await reminder()).toBeNull();
});

test("review tickets and unobserved assignments still count", async () => {
	await h.read(async (tx) => {
		const status = await seedStatus(tx, {
			projectId,
			name: "Review",
			category: "review",
			position: 1,
			reviewer: "human",
		});
		await seedTicket(tx, { projectId, rootId: projectId, statusId: status });
	});
	await worker("idle");
	await worker("closed", projectId, { closed_at: NOW });
	await worker("external", projectId, { runtime: "external" });
	expect(await reminder()).toMatchObject({ freeSlots: 2, unfinishedTickets: 1 });
});

test("only owned projects with work contribute free slots", async () => {
	const child = await h.read((tx) =>
		seedChild(tx, projectId, projectId, "child", {
			manager_config: { ...DEFAULT_PROJECT_MANAGER_CONFIG, concurrency: 2 },
		}),
	);
	await ticket(child);
	const other = await h.read((tx) =>
		seedChild(tx, projectId, projectId, "managed", {
			manager_config: { ...DEFAULT_PROJECT_MANAGER_CONFIG, personaId: ulid() },
		}),
	);
	const archived = await h.read((tx) => seedChild(tx, projectId, projectId, "archived", { archived_at: NOW }));
	await ticket(other);
	await ticket(archived);
	expect(await reminder()).toMatchObject({ freeSlots: 2, unfinishedTickets: 1, projects: [{ projectId: child }] });
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb WHERE id=${child}`,
	);
	expect(await reminder()).toBeNull();
});

test("a delegation shares its remaining budget across projects and reserves child budgets", async () => {
	const parent = await h.read((tx) =>
		seedRoot(tx, "PARENT", { manager_config: { ...DEFAULT_PROJECT_MANAGER_CONFIG, personaId: ulid() } }),
	);
	await worker("parent-manager", parent, { kind: "manager" });
	await worker("manager", projectId, { kind: "manager" });
	const child = await h.read((tx) =>
		seedChild(tx, projectId, projectId, "child", {
			manager_config: { ...DEFAULT_PROJECT_MANAGER_CONFIG, concurrency: 3 },
		}),
	);
	const delegated = await h.read((tx) => seedChild(tx, projectId, projectId, "delegated"));
	await worker("child-manager", delegated, { kind: "manager" });
	await h.rows(sql`INSERT INTO manager_delegations (run_id,parent_run_id,project_id,capacity,brief,created_at) VALUES
		('manager','parent-manager',${projectId},4,'Manage',${NOW}),
		('child-manager','manager',${delegated},2,'Manage',${NOW})`);
	await ticket();
	await ticket(child);
	await ticket(delegated);
	await worker("worker");
	expect(await reminder()).toMatchObject({ freeSlots: 1, unfinishedTickets: 2 });
	await worker("second", child);
	expect(await reminder()).toBeNull();
});

test("free slots in another project do not make a full project available", async () => {
	await h.read((tx) => seedChild(tx, projectId, projectId, "empty"));
	await ticket();
	for (const id of ["one", "two", "three"]) await worker(id);
	expect(await reminder()).toBeNull();
});

test("global and ancestor pauses suppress the reminder", async () => {
	await ticket();
	await h.rows(sql`INSERT INTO settings(key,value,updated_at) VALUES ('nativeWorkPaused','true'::jsonb,${NOW})`);
	expect(await reminder()).toBeNull();
	await h.rows(sql`DELETE FROM settings WHERE key='nativeWorkPaused'`);
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"dispatchPaused":true}'::jsonb WHERE id=${projectId}`,
	);
	expect(await reminder()).toBeNull();
});

test.each([
	["idle", { activity: { state: "idle", updatedAt: NOW.toISOString() } }, 3],
	["working", { activity: { state: "working", updatedAt: NOW.toISOString() } }, 2],
	["exited", { status: "exited" }, 3],
	["unknown", { status: "unknown" }, 2],
	["uncontrollable", { controllable: false }, 2],
	["launch pending", { acknowledgedMessageIds: [] }, 2],
] as const)("%s workers have consistent capacity and heartbeat counts", async (_name, overrides, freeSlots) => {
	await ticket();
	await worker("worker", projectId, { terminal_id: "worker-attempt" });
	const sessions = [controllerSession("worker-attempt", overrides as Partial<RuntimeProcessStatus>)];
	expect(await h.read((tx) => capacityReminder(tx, { projectId, sessions }))).toMatchObject({ freeSlots });
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || '{"concurrency":1}'::jsonb WHERE id=${projectId}`,
	);
	expect(await h.read((tx) => capacityAvailable(tx, { projectId, sessions }))).toBe(freeSlots === 3);
});

test("an idle worker occupies a slot again when its next turn starts", async () => {
	await ticket();
	await worker("worker", projectId, { terminal_id: "worker-attempt" });
	const idle = controllerSession("worker-attempt");
	expect(await h.read((tx) => capacityReminder(tx, { projectId, sessions: [idle] }))).toMatchObject({ freeSlots: 3 });
	const working = controllerSession("worker-attempt", { activity: { state: "working", updatedAt: NOW.toISOString() } });
	expect(await h.read((tx) => capacityReminder(tx, { projectId, sessions: [working] }))).toMatchObject({
		freeSlots: 2,
	});
});
