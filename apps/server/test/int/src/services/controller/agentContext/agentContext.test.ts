import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { Tx } from "../../../../../../src/db/tx.ts";
import { agentContext } from "../../../../../../src/services/controller/agentContext/index.ts";
import { insertRow, seedChild, seedRoot, seedStatus } from "../../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../../helpers/controllerSession.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let projectId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	projectId = await h.read((tx) => seedRoot(tx, "CTX"));
});

const assignment = (tx: Tx, id: string, project = projectId, overrides: Record<string, unknown> = {}) =>
	insertRow(tx, "agent_runs", {
		id,
		name: id,
		persona_name: "Builder",
		kind: "builder",
		instruction: "Build",
		project_id: project,
		project_path: "CTX",
		terminal_id: id,
		created_at: NOW,
		updated_at: NOW,
		...overrides,
	});
const snapshot = (sessions: ReturnType<typeof controllerSession>[]) =>
	h.read((tx) => agentContext({ now: secondsAfter(60) }, tx, { projectId, runId: "manager", sessions }));

test.each(["failed", "interrupted", "completed"] as const)(
	"a turn with outcome %s cannot report active work after a late tool event",
	async (outcome) => {
		await h.read((tx) => assignment(tx, "worker"));
		const context = await snapshot([
			controllerSession("worker", {
				activity: { state: "working", updatedAt: NOW.toISOString() },
				agent: {
					sessionId: "conversation",
					model: null,
					turnId: "turn",
					error: null,
					outcome,
					tool: { id: "late-tool", name: "Bash" },
					lastTool: null,
					lastMessage: null,
				},
			}),
		]);
		expect(context.agents[0]).toMatchObject({ isWorking: false, tool: null });
	},
);

test("the context separates process status from turn activity and retains assignment identifiers", async () => {
	let ticketId: string;
	await h.read(async (tx) => {
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		for (const id of ["idle", "working", "ready", "unknown", "missing", "exited", "unobserved"])
			await assignment(tx, id, projectId, { ticket_id: ticketId, ticket_identifier: "CTX-1" });
	});
	const agent = {
		sessionId: "conversation",
		model: "model",
		turnId: "turn-1",
		error: null,
		outcome: null,
		lastTool: {
			id: "tool-1",
			name: "Bash",
			input: { command: "bun test" },
			output: "44 pass",
			startedAt: NOW.toISOString(),
			updatedAt: secondsAfter(5).toISOString(),
			status: "completed" as const,
			error: null,
		},
		lastMessage: { text: "Tests pass.", at: secondsAfter(6).toISOString() },
		tool: { id: "tool-1", name: "Bash", input: { secret: "omit tool input" }, output: "omit tool output" },
	};
	const context = await snapshot([
		controllerSession("idle", { result: { id: "result-1", text: "The change is ready." }, agent }),
		controllerSession("working", { activity: { state: "working", updatedAt: NOW.toISOString() }, agent }),
		controllerSession("ready", { activity: { state: "ready", updatedAt: NOW.toISOString() } }),
		controllerSession("unknown", {
			status: "unknown",
			activity: { state: "working", updatedAt: NOW.toISOString() },
			controllable: false,
		}),
		controllerSession("exited", {
			status: "exited",
			activity: { state: "working", updatedAt: NOW.toISOString() },
			exitCode: 1,
			error: "Process failed",
			controllable: false,
		}),
		controllerSession("unobserved", { activity: null }),
	]);
	for (const agent of context.agents)
		for (const field of ["attemptId", "pid", "turnId", "lastTool", "lastMessage", "lastResult", "error"])
			expect(agent).not.toHaveProperty(field);
	expect(context.observedAt).toBe(secondsAfter(60).toISOString());
	const byId = new Map(context.agents.map((agent) => [agent.runId, agent]));
	expect(byId.get("idle")).toMatchObject({
		name: "Builder",
		ticketId: ticketId!,
		ticketIdentifier: "CTX-1",
		processStatus: "running",
		controllable: true,
		checkedAt: NOW.toISOString(),
		activity: "idle",
		lastActivityAt: NOW.toISOString(),
		isWorking: false,
		tool: null,
	});
	expect(byId.get("working")).toMatchObject({
		isWorking: true,
		tool: { name: "Bash" },
	});
	expect(byId.get("working")!.tool).toEqual({ name: "Bash" });
	expect(byId.get("ready")).toMatchObject({ activity: "ready", isWorking: false });
	expect(byId.get("unknown")).toMatchObject({ processStatus: "unknown", isWorking: null });
	expect(byId.get("missing")).toMatchObject({
		processStatus: "missing",
		activity: "unknown",
		isWorking: null,
		checkedAt: null,
		controllable: false,
	});
	expect(byId.get("exited")).toMatchObject({
		processStatus: "exited",
		isWorking: false,
	});
	expect(byId.get("unobserved")).toMatchObject({ activity: "unknown", isWorking: null, lastActivityAt: null });
});

test("the context follows manager scope and includes a live process even after assignment closure", async () => {
	await h.read(async (tx) => {
		const child = await seedChild(tx, projectId, projectId, "child");
		const grandchild = await seedChild(tx, child, projectId, "grandchild");
		const managed = await seedChild(tx, projectId, projectId, "managed", { manager_config: { personaId: "persona" } });
		const managedChild = await seedChild(tx, managed, projectId, "managed-child");
		const archived = await seedChild(tx, projectId, projectId, "archived", { archived_at: NOW });
		const archivedChild = await seedChild(tx, archived, projectId, "archived-child");
		const other = await seedRoot(tx, "OTHER");
		await assignment(tx, "manager", projectId, { kind: "manager" });
		await assignment(tx, "root");
		await assignment(tx, "child", child);
		await assignment(tx, "grandchild", grandchild);
		await assignment(tx, "managed", managed);
		await assignment(tx, "managed-child", managedChild);
		await assignment(tx, "archived", archived);
		await assignment(tx, "archived-child", archivedChild);
		await assignment(tx, "other", other);
		await assignment(tx, "closed", projectId, { closed_at: NOW });
		await assignment(tx, "closed-live", projectId, { closed_at: NOW });
		await assignment(tx, "external", projectId, { runtime: "external" });
	});
	const context = await snapshot([controllerSession("closed-live"), controllerSession("closed", { status: "exited" })]);
	expect(context.agents.map((agent) => agent.runId)).toEqual(["child", "closed-live", "grandchild", "root"]);
});

test("the context uses the exact attempt and omits diagnostic details", async () => {
	await h.read(async (tx) => {
		await assignment(tx, "worker", projectId, { terminal_id: "current-attempt" });
		await assignment(tx, "unstarted", projectId, { terminal_id: null, error: "Launch failed" });
	});
	const old = controllerSession("old-attempt", { activity: { state: "working", updatedAt: NOW.toISOString() } });
	expect((await snapshot([old])).agents.find((agent) => agent.runId === "worker")).toMatchObject({
		processStatus: "missing",
		isWorking: null,
	});
	const context = await snapshot([
		old,
		controllerSession("current-attempt", { result: { id: "result", text: "x".repeat(3000) } }),
	]);
	for (const agent of context.agents)
		for (const field of ["attemptId", "pid", "turnId", "lastTool", "lastMessage", "lastResult", "error", "exitCode"])
			expect(agent).not.toHaveProperty(field);
	expect(context.agents.find((agent) => agent.runId === "unstarted")).toMatchObject({
		processStatus: "missing",
		isWorking: null,
	});
});

test("a project without worker assignments has an explicit empty context", async () => {
	expect(await snapshot([])).toEqual({ observedAt: secondsAfter(60).toISOString(), agents: [] });
});

test("a recovered process retains its last activity without claiming current work after the event connection is lost", async () => {
	await h.read((tx) => assignment(tx, "recovered"));
	const context = await snapshot([
		controllerSession("recovered", {
			controllable: false,
			activity: { state: "working", updatedAt: NOW.toISOString() },
		}),
	]);
	expect(context.agents[0]).toMatchObject({ processStatus: "running", activity: "working", isWorking: null });
});
