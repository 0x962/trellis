import { afterAll, beforeAll, expect, test } from "bun:test";
import { UlidSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../testDb.ts";
import {
	advanceControllerOwnerEpoch,
	control,
	createHost,
	deleteHost,
	editHost,
	getHost,
	hostReferences,
	listHosts,
	localHost,
	placementInputs,
	recordObservation,
	setDefaultHost,
	setHostState,
} from "./index.ts";
import { seedAccount, seedAttempt, seedFlow, seedProject, seedProjectPath, seedRun, seedTicket } from "./testSeed.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const now = new Date("2026-10-10T16:00:00.000Z");
const later = new Date("2026-10-10T17:00:00.000Z");

beforeAll(async () => {
	db = await openTestDb();
});
afterAll(async () => {
	await db.$client.close();
});

const ssh = (name: string) => db.transaction((tx) => createHost(tx, { name, kind: "ssh", now }));

test("a fresh database has one local host and one control row with ULID ids", async () => {
	const host = await db.transaction((tx) => localHost(tx));
	expect(host).toMatchObject({ name: "Execution host", kind: "local", local: true, state: "active", revision: 1 });
	expect(UlidSchema.safeParse(host.id).success).toBe(true);
	const workspace = await db.transaction((tx) => control(tx));
	expect(workspace).toEqual({ controlId: workspace.controlId, controllerOwnerEpoch: 1, defaultHostId: host.id });
	expect(UlidSchema.safeParse(workspace.controlId).success).toBe(true);
	const counts = await db.execute(sql`
		SELECT (SELECT count(*)::int FROM hosts) AS hosts, (SELECT count(*)::int FROM workspace_control) AS control
	`);
	expect(counts.rows[0]).toEqual({ hosts: 1, control: 1 });
});

test("an insert without host_id receives the local host", async () => {
	const local = await db.transaction((tx) => localHost(tx));
	const runId = await seedRun(db);
	const attemptId = await seedAttempt(db, runId);
	const project = await seedProject(db, null);
	const ticketId = await seedTicket(db, project, null);
	const flowId = await seedFlow(db, ticketId, project.id);
	const accountId = await seedAccount(db, `/profiles/${ulid()}`);
	const found = await db.execute(sql`
		SELECT
			(SELECT host_id FROM agent_runs WHERE id = ${runId}) AS run,
			(SELECT host_id FROM agent_execution_attempts WHERE id = ${attemptId}) AS attempt,
			(SELECT host_id FROM flow_executions WHERE id = ${flowId}) AS flow,
			(SELECT host_id FROM harness_accounts WHERE id = ${accountId}) AS account,
			(SELECT host_id FROM tickets WHERE id = ${ticketId}) AS ticket
	`);
	expect(found.rows[0]).toEqual({ run: local.id, attempt: local.id, flow: local.id, account: local.id, ticket: null });
});

test("createHost makes an ssh host and the constraints refuse bad rows", async () => {
	const host = await db.transaction((tx) =>
		createHost(tx, { name: "Build box", kind: "ssh", endpoint: { alias: "build", port: 22 }, now }),
	);
	expect(host).toMatchObject({
		name: "Build box",
		kind: "ssh",
		local: false,
		endpoint: { alias: "build", port: 22 },
		state: "active",
		revision: 1,
		createdAt: now.toISOString(),
	});
	expect(UlidSchema.safeParse(host.id).success).toBe(true);
	await expect(db.transaction((tx) => createHost(tx, { name: "Second local", kind: "local", now }))).rejects.toThrow(
		"hosts_local_idx",
	);
	await expect(db.execute(sql`UPDATE hosts SET state = 'paused' WHERE id = ${host.id}`)).rejects.toThrow(
		"hosts_state_check",
	);
	await expect(db.transaction((tx) => createHost(tx, { name: " x", kind: "ssh", now }))).rejects.toThrow(
		"hosts_name_check",
	);
});

test("editHost writes only at the expected revision and keeps the identity", async () => {
	const host = await db.transaction((tx) =>
		createHost(tx, { name: "Edit me", kind: "ssh", enrolledIdentity: "worker-1", now }),
	);
	const edited = await db.transaction((tx) =>
		editHost(tx, {
			id: host.id,
			expectedRevision: 1,
			patch: { name: "Renamed", endpoint: { alias: "renamed" }, os: "linux" },
			now: later,
		}),
	);
	expect(edited).toMatchObject({
		id: host.id,
		name: "Renamed",
		endpoint: { alias: "renamed" },
		os: "linux",
		enrolledIdentity: "worker-1",
		revision: 2,
		updatedAt: later.toISOString(),
		createdAt: host.createdAt,
	});
	const stale = await db.transaction((tx) =>
		editHost(tx, { id: host.id, expectedRevision: 1, patch: { name: "Stale" }, now: later }),
	);
	expect(stale).toBeNull();
	expect(await db.transaction((tx) => getHost(tx, { id: host.id }))).toEqual(edited);
	expect(
		await db.transaction((tx) => editHost(tx, { id: ulid(), expectedRevision: 1, patch: {}, now: later })),
	).toBeNull();
});

test("a retired host keeps its references and stays readable", async () => {
	const host = await ssh("Retire me");
	const runId = await seedRun(db, host.id);
	const retired = await db.transaction((tx) =>
		setHostState(tx, { id: host.id, expectedRevision: 1, state: "retired", now: later }),
	);
	expect(retired).toMatchObject({ state: "retired", retiredAt: later.toISOString(), revokedAt: null, revision: 2 });
	const run = await db.execute(sql`SELECT host_id FROM agent_runs WHERE id = ${runId}`);
	expect(run.rows[0]).toEqual({ host_id: host.id });
	const active = await db.transaction((tx) => listHosts(tx));
	expect(active.find((row) => row.id === host.id)).toBeUndefined();
	const all = await db.transaction((tx) => listHosts(tx, { includeRetired: true }));
	expect(all.find((row) => row.id === host.id)).toEqual({ ...retired!, observation: null });
	expect(all[0]!.local).toBe(true);
	expect(await db.transaction((tx) => getHost(tx, { id: host.id }))).toEqual(retired);
	expect(
		await db.transaction((tx) => setHostState(tx, { id: host.id, expectedRevision: 1, state: "active", now: later })),
	).toBeNull();
});

test("deleteHost refuses the local host and a referenced host", async () => {
	const local = await db.transaction((tx) => localHost(tx));
	expect(await db.transaction((tx) => deleteHost(tx, { id: local.id }))).toEqual({ deleted: false, reason: "local" });
	expect(await db.transaction((tx) => hostReferences(tx, { id: local.id }))).toMatchObject({ workspaceDefault: true });
	const host = await ssh("Referenced");
	await seedRun(db, host.id);
	const withRun = await db.transaction((tx) => deleteHost(tx, { id: host.id }));
	expect(withRun).toEqual({
		deleted: false,
		reason: "referenced",
		references: {
			runs: 1,
			attempts: 0,
			flows: 0,
			accounts: 0,
			projectPaths: 0,
			projectDefaults: 0,
			ticketPreferences: 0,
			workspaceDefault: false,
		},
	});
	await expect(db.execute(sql`DELETE FROM hosts WHERE id = ${host.id}`)).rejects.toMatchObject({ code: "23503" });
	expect(await db.transaction((tx) => getHost(tx, { id: host.id }))).not.toBeNull();
});

test("deleteHost refuses a host that an attempt, a flow, an account, or a project path names", async () => {
	const host = await ssh("Bound");
	await seedAttempt(db, await seedRun(db), host.id);
	const project = await seedProject(db, null);
	await seedFlow(db, await seedTicket(db, project, null), project.id, host.id);
	await seedAccount(db, `/profiles/${ulid()}`, host.id);
	await seedProjectPath(db, project.id, host.id);
	const references = await db.transaction((tx) => hostReferences(tx, { id: host.id }));
	expect(references).toEqual({
		runs: 0,
		attempts: 1,
		flows: 1,
		accounts: 1,
		projectPaths: 1,
		projectDefaults: 0,
		ticketPreferences: 0,
		workspaceDefault: false,
	});
	expect(await db.transaction((tx) => deleteHost(tx, { id: host.id }))).toEqual({
		deleted: false,
		reason: "referenced",
		references,
	});
});

test("deleteHost reports an unknown id as missing", async () => {
	expect(await db.transaction((tx) => deleteHost(tx, { id: ulid() }))).toEqual({ deleted: false, reason: "missing" });
});

test("two hosts can hold one harness profile path each", async () => {
	const first = await ssh("Profile first");
	const second = await ssh("Profile second");
	const profilePath = `/profiles/${ulid()}`;
	await seedAccount(db, profilePath, first.id);
	await seedAccount(db, profilePath, second.id);
	await expect(seedAccount(db, profilePath, second.id)).rejects.toThrow("harness_accounts_profile_idx");
});

test("deleteHost removes an unreferenced host and its observation", async () => {
	const host = await ssh("Unreferenced");
	const observation = await db.transaction((tx) =>
		recordObservation(tx, { hostId: host.id, observedAt: now, result: "unreachable", detail: "timeout" }),
	);
	expect(observation).toEqual({
		hostId: host.id,
		observedAt: now.toISOString(),
		result: "unreachable",
		observedIdentity: null,
		protocol: null,
		capabilities: {},
		detail: "timeout",
	});
	const replaced = await db.transaction((tx) =>
		recordObservation(tx, {
			hostId: host.id,
			observedAt: later,
			result: "reachable",
			observedIdentity: "worker-2",
			protocol: 3,
			capabilities: { git: true },
		}),
	);
	expect(replaced).toMatchObject({ result: "reachable", observedIdentity: "worker-2", protocol: 3 });
	const listed = await db.transaction((tx) => listHosts(tx));
	expect(listed.find((row) => row.id === host.id)?.observation).toEqual(replaced);
	expect(await db.transaction((tx) => hostReferences(tx, { id: host.id }))).toMatchObject({ runs: 0 });
	expect(await db.transaction((tx) => deleteHost(tx, { id: host.id }))).toEqual({ deleted: true });
	expect(await db.transaction((tx) => getHost(tx, { id: host.id }))).toBeNull();
	const observations = await db.execute(sql`SELECT 1 FROM host_observations WHERE host_id = ${host.id}`);
	expect(observations.rows).toEqual([]);
});

test("placementInputs reads the workspace, the project, and the ticket", async () => {
	const local = await db.transaction((tx) => localHost(tx));
	const projectHost = await ssh("Project host");
	const ticketHost = await ssh("Ticket host");
	const project = await seedProject(db, projectHost.id);
	const ticketId = await seedTicket(db, project, ticketHost.id);
	expect(await db.transaction((tx) => placementInputs(tx, { ticketId, projectId: project.id }))).toEqual({
		workspaceDefaultHostId: local.id,
		projectDefaultHostId: projectHost.id,
		ticketHostId: ticketHost.id,
	});
	expect(await db.transaction((tx) => placementInputs(tx))).toEqual({
		workspaceDefaultHostId: local.id,
		projectDefaultHostId: null,
		ticketHostId: null,
	});
	expect(await db.transaction((tx) => hostReferences(tx, { id: projectHost.id }))).toMatchObject({
		projectDefaults: 1,
	});
	expect(await db.transaction((tx) => hostReferences(tx, { id: ticketHost.id }))).toMatchObject({
		ticketPreferences: 1,
	});
	const changed = await db.transaction((tx) => setDefaultHost(tx, { hostId: projectHost.id, now: later }));
	expect(changed.defaultHostId).toBe(projectHost.id);
	expect((await db.transaction((tx) => placementInputs(tx))).workspaceDefaultHostId).toBe(projectHost.id);
	await db.transaction((tx) => setDefaultHost(tx, { hostId: local.id, now: later }));
});

test("advanceControllerOwnerEpoch advances once per expected epoch", async () => {
	const before = await db.transaction((tx) => control(tx));
	const next = await db.transaction((tx) =>
		advanceControllerOwnerEpoch(tx, { expectedEpoch: before.controllerOwnerEpoch, now: later }),
	);
	expect(next).toBe(before.controllerOwnerEpoch + 1);
	expect(
		await db.transaction((tx) =>
			advanceControllerOwnerEpoch(tx, { expectedEpoch: before.controllerOwnerEpoch, now: later }),
		),
	).toBeNull();
	expect((await db.transaction((tx) => control(tx))).controllerOwnerEpoch).toBe(next!);
	await expect(
		db.execute(sql`INSERT INTO workspace_control (id, default_host_id, created_at, updated_at)
		VALUES (${ulid()}, ${before.defaultHostId}, ${now}, ${now})`),
	).rejects.toThrow("workspace_control_singleton_unique");
});

test("a rollback leaves no host", async () => {
	let id = "";
	await expect(
		db.transaction(async (tx) => {
			id = (await createHost(tx, { name: "Rolled back", kind: "ssh", now })).id;
			throw new Error("Rollback");
		}),
	).rejects.toThrow("Rollback");
	expect(await db.transaction((tx) => getHost(tx, { id }))).toBeNull();
});
