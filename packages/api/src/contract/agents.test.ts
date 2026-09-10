import { describe, expect, test } from "bun:test";
import { accepts } from "../../test/standardSchema.ts";
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
			"register POST /agents/register",
			"retry POST /agents/sessions/{id}/retry",
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
		for (const name of [
			"startBuilder",
			"startReviewer",
			"stop",
			"wake",
			"runnerProjects",
			"retry",
			"setSettings",
		] as const) {
			expect(agents[name]["~orpc"].errorMap, name).toHaveProperty("RUNNER_UNAVAILABLE");
		}
		for (const name of ["startBuilder", "retry"] as const) {
			expect(agents[name]["~orpc"].errorMap, name).toHaveProperty("CONCURRENCY_LIMIT");
		}
		expect(agents.setSettings["~orpc"].errorMap).toHaveProperty("AGENT_SETTINGS_UNUSABLE");
		expect(agents.startReviewer["~orpc"].errorMap).toHaveProperty("INVALID_PR_URL");
		for (const name of ["startBuilder", "startReviewer"] as const) {
			expect(agents[name]["~orpc"].errorMap, name).toHaveProperty("PROJECT_ARCHIVED");
		}
		for (const name of ["sessions", "inbox", "register", "settings"] as const) {
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
			title: "CDE manager",
			openUrl: null,
			failure: null,
			lastWokenAt: null,
			createdAt: "2026-09-10T10:00:00.000Z",
		};
		expect(await accepts(agents.sessions["~orpc"].outputSchema, { sessions: [row] })).toBe(true);
		expect(await accepts(agents.sessions["~orpc"].outputSchema, [row])).toBe(false);
		for (const name of ["register", "startBuilder", "startReviewer", "stop", "wake", "retry"] as const) {
			expect(await accepts(agents[name]["~orpc"].outputSchema, row), name).toBe(true);
		}
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
});
