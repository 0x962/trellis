import { afterAll, beforeAll, beforeEach, expect } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AgentSession, AgentSettingsSetInput, Project, TrellisEvent } from "@trellis/api";
import { createTestApp, type TestApp } from "./app.ts";
import { SUPERSET_STUB_BIN, type SupersetStubHandle, supersetStub } from "./superset-stub.ts";

// The hooks an agents contract test file shares. The file gets one app, so
// the worker transport boots one database worker for it. Each test gets a
// project key of its own ("K1", "K2", ...), so the rows of an earlier test
// never meet it. The fake superset starts each test with one Superset
// project for the repo acme/web and the test project's manager workspace
// with a live manager tab. The app spawns a copy of the fake, so a test can
// delete the binary. `events` holds what the bus carried during the test.

export type ProjectAgentOverrides = Partial<AgentSettingsSetInput["projects"][number]>;

export const agentsHarness = () => {
	let t: TestApp;
	let stub: SupersetStubHandle;
	let bin: string;
	let count = 0;
	let key = "";
	const events: TrellisEvent[] = [];

	const lower = () => key.toLowerCase();
	const tab = () => ({ workspaceId: `ws-m-${key}`, terminalId: `t-m-${key}` });

	beforeAll(async () => {
		const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-"));
		bin = join(dir, "superset");
		stub = supersetStub(dir);
		t = await createTestApp({ supersetBin: bin });
		t.bus.subscribe(({ event }) => void events.push(event));
	});
	beforeEach(() => {
		count += 1;
		key = `K${count}`;
		copyFileSync(SUPERSET_STUB_BIN, bin);
		chmodSync(bin, 0o755);
		stub.reset({
			projects: [{ id: "sp-web", name: "web", repo: "acme/web", path: "/src/web" }],
			workspaces: [
				{
					id: tab().workspaceId,
					name: `${key} · manager`,
					branch: `trellis-${lower()}-manager`,
					projectId: "sp-web",
					baseBranch: "main",
					tag: `trellis-${lower()}`,
				},
			],
			terminals: [{ ...tab(), label: "Terminal", title: `${key} manager`, command: null, exited: false, sent: [] }],
		});
		events.length = 0;
	});
	afterAll(async () => {
		await t.close();
		stub.restore();
	});

	// Turns agents on for `projectId`. `global` false leaves the global switch off.
	const setAgents = async (projectId: string, overrides: ProjectAgentOverrides = {}, global = true) => {
		const row = {
			projectId,
			enabled: true,
			supersetProjectId: null,
			supersetHostId: null,
			baseBranch: "main",
			maxConcurrent: 3,
			removeWorkspaceOnDone: true,
			...overrides,
		};
		const put = await t.api("/api/agents/settings", {
			method: "PUT",
			body: { runner: "superset", enabled: global, projects: [row] },
		});
		expect(put.status).toBe(200);
	};

	// Seeds the test project with the repo acme/web and turns agents on for it.
	const enable = async (overrides: ProjectAgentOverrides = {}, global = true): Promise<Project> => {
		const project = await t.seedProject(key);
		const repos = await t.api(`/api/projects/${key}/repos`, {
			method: "PUT",
			body: { repos: [{ owner: "acme", repo: "web" }] },
		});
		expect(repos.status).toBe(200);
		await setAgents(project.id, overrides, global);
		return project;
	};

	// Registers the manager tab of the fake as the test project's manager.
	const registerManager = async (claudeSessionId = "claude-1"): Promise<AgentSession> => {
		const body = { role: "manager", project: key, ...tab(), claudeSessionId };
		const response = await t.api("/api/agents/register", { method: "POST", body, actor: manager() });
		expect(response.status).toBe(200);
		return response.body as AgentSession;
	};

	const manager = () => `agent:manager-${lower()}`;

	const post = (path: string, body: unknown) => t.api(path, { method: "POST", body, actor: manager() });

	// Starts a builder for `ticket` and returns its session.
	const startBuilder = async (ticket: string): Promise<AgentSession> => {
		const response = await post("/api/agents/builder", { ticket });
		expect(response.status).toBe(200);
		return response.body as AgentSession;
	};

	// The sessions `query` selects, such as "project=K1" or "ticket=K1-1".
	const sessions = async (query: string): Promise<AgentSession[]> => {
		const response = await t.api(`/api/agents/sessions?${query}`, { actor: null });
		expect(response.status).toBe(200);
		return response.body.sessions as AgentSession[];
	};

	const sessionEvents = () => events.flatMap((event) => (event.type === "agents.session" ? [event.session] : []));

	return {
		get t() {
			return t;
		},
		get stub() {
			return stub;
		},
		get key() {
			return key;
		},
		get lower() {
			return lower();
		},
		get manager() {
			return manager();
		},
		get tab() {
			return tab();
		},
		// The identifier of ticket number `n` of the test project.
		ticket: (n: number) => `${key}-${n}`,
		removeBin: () => rmSync(bin),
		events,
		setAgents,
		enable,
		registerManager,
		post,
		startBuilder,
		sessions,
		sessionEvents,
	};
};
