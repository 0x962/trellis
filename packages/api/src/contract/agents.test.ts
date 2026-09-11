import { describe, expect, test } from "bun:test";
import { accepts } from "../../test/standardSchema.ts";
import { AgentSettingsSchema, AgentSettingsSetInputSchema } from "../schemas/agent.ts";
import { agents } from "./agents.ts";

describe("agents contract", () => {
	// The inbox advances the stored cursor, so it is a write. A GET could be
	// retried or prefetched and then skip events for the manager.
	test("every agents write is a non-GET route under /agents and every read is GET", () => {
		const table = Object.entries(agents)
			.map(([name, procedure]) => `${name} ${procedure["~orpc"].route.method} ${procedure["~orpc"].route.path}`)
			.sort();
		expect(table).toEqual([
			"inbox POST /agents/inbox",
			"overview GET /agents/overview",
			"register POST /agents/register",
			"retryManager POST /agents/manager/retry",
			"runnerHosts GET /agents/runner-hosts",
			"runnerProjects GET /agents/runner-projects",
			"sessions GET /agents/sessions",
			"setSettings PUT /agents/settings",
			"settings GET /agents/settings",
			"startBuilder POST /agents/builder",
			"startReviewer POST /agents/reviewer",
			"stop POST /agents/sessions/{id}/stop",
			"wake POST /agents/wake",
		]);
	});

	// Every procedure that calls the runner can find it missing or turned
	// off. A builder start can also hit the per-project limit.
	test("each runner call declares RUNNER_UNAVAILABLE and a builder start declares CONCURRENCY_LIMIT", () => {
		const callers = ["startBuilder", "startReviewer", "stop", "wake", "runnerProjects", "runnerHosts", "retryManager"];
		for (const name of callers as Array<keyof typeof agents>) {
			expect(agents[name]["~orpc"].errorMap, name).toHaveProperty("RUNNER_UNAVAILABLE");
		}
		expect(agents.startBuilder["~orpc"].errorMap).toHaveProperty("CONCURRENCY_LIMIT");
		expect(agents.startReviewer["~orpc"].errorMap).toHaveProperty("INVALID_PR_URL");
		for (const name of ["startBuilder", "startReviewer"] as const) {
			expect(agents[name]["~orpc"].errorMap, name).toHaveProperty("PROJECT_ARCHIVED");
		}
		for (const name of ["sessions", "inbox", "register", "settings", "setSettings"] as const) {
			expect(agents[name]["~orpc"].errorMap, name).not.toHaveProperty("RUNNER_UNAVAILABLE");
		}
	});

	test("the start, stop, and wake inputs take refs, a PR URL, a session id, and a text", async () => {
		const startBuilder = agents.startBuilder["~orpc"].inputSchema;
		expect(await accepts(startBuilder, { ticket: "CDE-42" })).toBe(true);
		expect(await accepts(startBuilder, { ticket: "CDE" })).toBe(false);
		expect(await accepts(startBuilder, { ticket: "CDE-42", branch: "x" })).toBe(false);

		const startReviewer = agents.startReviewer["~orpc"].inputSchema;
		const prUrl = "https://github.com/0x962/trellis/pull/7";
		expect(await accepts(startReviewer, { ticket: "CDE-42", prUrl })).toBe(true);
		expect(await accepts(startReviewer, { ticket: "CDE-42" })).toBe(false);

		const stop = agents.stop["~orpc"].inputSchema;
		expect(await accepts(stop, { id: "01J8Z6X4Q3M2K1H0G9F8E7D6C5" })).toBe(true);
		expect(await accepts(stop, { id: "CDE-42" })).toBe(false);

		const wake = agents.wake["~orpc"].inputSchema;
		expect(await accepts(wake, { project: "CDE", text: "trellis: 1 change" })).toBe(true);
		expect(await accepts(wake, { project: "CDE" })).toBe(false);
	});

	test("the sessions read wraps the rows in an object and every session write returns one session", async () => {
		const row = {
			id: "01J8Z6X4Q3M2K1H0G9F8E7D6C5",
			projectId: "01J8Z6X4Q3M2K1H0G9F8E7D6P1",
			ticketId: null,
			role: "manager",
			runner: "superset",
			state: "starting",
			workspaceId: null,
			terminalId: null,
			name: "Amara",
			title: "CDE manager",
			openUrl: null,
			lastWokenAt: null,
			error: null,
			createdAt: "2026-09-10T10:00:00.000Z",
		};
		expect(await accepts(agents.sessions["~orpc"].outputSchema, { sessions: [row] })).toBe(true);
		expect(await accepts(agents.sessions["~orpc"].outputSchema, [row])).toBe(false);
		for (const name of ["register", "startBuilder", "startReviewer", "stop", "wake", "retryManager"] as const) {
			expect(await accepts(agents[name]["~orpc"].outputSchema, row), name).toBe(true);
		}
		const failed = { ...row, state: "failed", error: "superset ws create: fatal: invalid reference: main" };
		expect(await accepts(agents.retryManager["~orpc"].outputSchema, failed)).toBe(true);
	});

	// The Activity page reads one answer: every session, the last agent
	// actions with the identifiers of their tickets, and the recent batches.
	test("overview returns the sessions, the agent actions, their tickets, and the recent batches", async () => {
		const overview = {
			sessions: [],
			actions: [],
			tickets: [{ id: "01J8Z6X4Q3M2K1H0G9F8E7D6C5", identifier: "CDE-42" }],
			batches: [
				{
					at: "2026-09-10T10:00:00.000Z",
					projectId: "01J8Z6X4Q3M2K1H0G9F8E7D6P1",
					count: 2,
					text: "trellis: 2 changes in CDE (CDE-42 created by dana). Run: trellis agents inbox --project CDE",
				},
			],
		};
		expect(await accepts(agents.overview["~orpc"].outputSchema, overview)).toBe(true);
		expect(await accepts(agents.retryManager["~orpc"].inputSchema, { project: "CDE" })).toBe(true);
		expect(await accepts(agents.retryManager["~orpc"].inputSchema, {})).toBe(false);
	});

	// The settings are a full replace, like `settings.set`. The PUT body and
	// the GET result have one shape.
	test("setSettings takes and returns the whole AgentSettings shape", async () => {
		const settings = { runner: "superset", enabled: false, projects: [] };
		expect(await accepts(agents.setSettings["~orpc"].inputSchema, settings)).toBe(true);
		expect(await accepts(agents.setSettings["~orpc"].inputSchema, { enabled: false })).toBe(false);
		expect(await accepts(agents.setSettings["~orpc"].outputSchema, settings)).toBe(true);
		expect(await accepts(agents.settings["~orpc"].outputSchema, settings)).toBe(true);
	});

	// A project row names the machine its agents run on. A row that names
	// none keeps the old behaviour, which is the machine that runs the
	// server.
	test("a project row carries supersetHostId, which defaults to null and takes a runner id", async () => {
		const row = { projectId: "01J8Z6X4Q3M2K1H0G9F8E7D6P1", enabled: true, supersetProjectId: null };
		const set = agents.setSettings["~orpc"].inputSchema;
		expect(await accepts(set, { runner: "superset", enabled: true, projects: [row] })).toBe(true);
		const hostId = "04705517c8ad3a6d7f595f395125ecfe";
		const named = { ...row, supersetHostId: hostId };
		expect(await accepts(set, { runner: "superset", enabled: true, projects: [named] })).toBe(true);
		expect(await accepts(set, { runner: "superset", enabled: true, projects: [{ ...row, supersetHostId: "" }] })).toBe(
			false,
		);
		const parsed = AgentSettingsSetInputSchema.parse({ runner: "superset", enabled: true, projects: [row] });
		expect(parsed.projects[0]!.supersetHostId).toBeNull();
		expect(AgentSettingsSchema.parse(parsed).projects[0]!.supersetHostId).toBeNull();
	});

	// The host picker offers the machines an agent can reach now, so the
	// list carries the online hosts only.
	test("runnerHosts wraps the online hosts in an object, each with an id and a name", async () => {
		const hosts = agents.runnerHosts["~orpc"].outputSchema;
		const host = { id: "04705517c8ad3a6d7f595f395125ecfe", name: "Navids-Mac-mini" };
		expect(await accepts(hosts, { hosts: [host] })).toBe(true);
		expect(await accepts(hosts, { hosts: [] })).toBe(true);
		expect(await accepts(hosts, [host])).toBe(false);
		expect(await accepts(hosts, { hosts: [{ id: host.id }] })).toBe(false);
	});
});
