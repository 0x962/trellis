import { afterEach, beforeEach, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { AgentSession, Project, TrellisEvent } from "@trellis/api";
import type { AgentsHost } from "../../src/agents/host.ts";
import type { InlineTransport } from "../../src/db/transport.ts";
import { createTestApp, type TestApp } from "./app.ts";
import { type FakeTimerClock, fakeTimerClock } from "./clock.ts";
import { type SupersetStubHandle, supersetStub } from "./superset-stub.ts";

// The pieces an agents host test file shares: a test app on the fake
// superset, a fake clock, the log lines of the host, and the events the bus
// carried. Each test gets a fresh app and a fresh state, and the host stops
// at the end of the test.

export const MANAGER = "agent:manager-cde";

export const agentsHostHarness = () => {
	let t: TestApp;
	let stub: SupersetStubHandle;
	let clock: FakeTimerClock;
	let host: AgentsHost | undefined;
	let logs: string[];
	let logged: Array<{ msg: string; fields: Record<string, unknown> | undefined }>;
	const events: TrellisEvent[] = [];

	beforeEach(async () => {
		stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
			projects: [{ id: "sp-web", name: "web", repo: "acme/web", path: "/src/web" }],
		});
		t = await createTestApp({ supersetBin: stub.bin });
		clock = fakeTimerClock(new Date("2026-09-10T12:00:00.000Z"));
		host = undefined;
		logs = [];
		logged = [];
		events.length = 0;
		t.bus.subscribe(({ event }) => void events.push(event));
	});
	afterEach(async () => {
		host?.stop();
		await t.close();
		stub.restore();
	});

	const startHost = async () => {
		const log = (msg: string, fields?: Record<string, unknown>) => {
			logs.push(msg);
			logged.push({ msg, fields });
		};
		host = (t.transport as InlineTransport).startAgents({ clock, log });
		await host.start();
		return host;
	};

	// The settings document that turns the manager of `project` on. `global`
	// false leaves the global switch off.
	const settingsFor = (project: Project, global: boolean) => ({
		runner: "superset",
		enabled: global,
		projects: [
			{
				projectId: project.id,
				enabled: true,
				supersetProjectId: null,
				baseBranch: "main",
				maxConcurrent: 3,
				removeWorkspaceOnDone: true,
			},
		],
	});

	const enable = async (global = true) => {
		const project = await t.seedProject();
		await t.api("/api/projects/CDE/repos", { method: "PUT", body: { repos: [{ owner: "acme", repo: "web" }] } });
		const put = await t.api("/api/agents/settings", { method: "PUT", body: settingsFor(project, global) });
		expect(put.status).toBe(200);
		return project;
	};

	const sessions = async (query = "project=CDE"): Promise<AgentSession[]> =>
		(await t.api(`/api/agents/sessions?${query}`, { actor: null })).body.sessions;

	const comment = (body: string, actor?: string) =>
		t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body }, actor });

	// Every text the runner typed into a terminal, oldest first.
	const sent = () => stub.state().terminals.flatMap((terminal) => terminal.sent);

	return {
		get t() {
			return t;
		},
		get stub() {
			return stub;
		},
		get clock() {
			return clock;
		},
		get host() {
			return host!;
		},
		get logs() {
			return logs;
		},
		get logged() {
			return logged;
		},
		events,
		startHost,
		settingsFor,
		enable,
		sessions,
		comment,
		sent,
	};
};
