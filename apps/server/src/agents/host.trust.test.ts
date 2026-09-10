import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentSession, Project, TrustedFolder } from "@trellis/api";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { type FakeTimerClock, fakeTimerClock } from "../../test/helpers/clock.ts";
import { type SupersetStubHandle, supersetStub } from "../../test/helpers/superset-stub.ts";
import type { InlineTransport } from "../db/transport.ts";
import { type AgentsHost, WATCHDOG_MS } from "./host.ts";

// The agents host writes the default trusted folder of a project, seeds
// the Claude state file before it starts a manager, and watches for an
// agent that holds a terminal and never registers.

let t: TestApp;
let stub: SupersetStubHandle;
let clock: FakeTimerClock;
let host: AgentsHost;

beforeEach(async () => {
	stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
		projects: [{ id: "sp-web", name: "web", repo: "acme/web", path: "/src/web" }],
	});
	t = await createTestApp({ supersetBin: stub.bin });
	clock = fakeTimerClock(new Date("2026-09-10T12:00:00.000Z"));
});
afterEach(async () => {
	host.stop();
	await t.close();
	stub.restore();
});

const startHost = async () => {
	host = (t.transport as InlineTransport).startAgents({ clock, log: () => undefined });
	await host.start();
	return host;
};

const enable = async (): Promise<Project> => {
	const project = await t.seedProject();
	await t.api("/api/projects/CDE/repos", { method: "PUT", body: { repos: [{ owner: "acme", repo: "web" }] } });
	const put = await t.api("/api/agents/settings", {
		method: "PUT",
		body: {
			runner: "superset",
			enabled: true,
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
		},
	});
	expect(put.status).toBe(200);
	return project;
};

const trustedFolders = async (): Promise<TrustedFolder[]> =>
	(await t.api("/api/projects/CDE", { actor: null })).body.trustedFolders as TrustedFolder[];

const sessions = async (): Promise<AgentSession[]> =>
	(await t.api("/api/agents/sessions?project=CDE", { actor: null })).body.sessions as AgentSession[];

const storeFile = () => t.config.claudeStateFile;

const trustedIn = (file: string) => {
	const state = JSON.parse(readFileSync(file, "utf-8")) as {
		projects?: Record<string, { hasTrustDialogAccepted?: boolean }>;
	};
	return Object.entries(state.projects ?? {})
		.filter(([, entry]) => entry.hasTrustDialogAccepted === true)
		.map(([path]) => path);
};

// The repo root lives in Superset, so a SQL migration cannot write it. The
// host writes it the first time the project has a runner project.
test("the host gives a project the repo root of its runner project as a trusted folder", async () => {
	await enable();
	await startHost();
	await host.idle();

	expect((await trustedFolders()).map((folder) => folder.path)).toEqual(["/src/web"]);
});

// The row is a row like any other. A person who removes it keeps it
// removed, so a restart never trusts a folder again behind their back.
test("a removed trusted folder stays removed across a restart of the host", async () => {
	await enable();
	await startHost();
	await host.idle();
	const cleared = await t.api("/api/projects/CDE/trusted-folders", { method: "PUT", body: { paths: [] } });
	expect(cleared.status).toBe(200);

	host.stop();
	host = (t.transport as InlineTransport).startAgents({ clock, log: () => undefined });
	await host.start();
	await host.idle();

	expect(await trustedFolders()).toEqual([]);
});

// Claude reads the folder trust from the file CLAUDE_CONFIG_DIR names, and
// the manager start writes it before the workspace runs its command.
test("the manager start seeds the trusted folder into the Claude state file", async () => {
	writeFileSync(storeFile(), JSON.stringify({ userID: "u1" }));
	await enable();
	await startHost();
	await host.idle();

	expect(trustedIn(storeFile())).toEqual(["/src/web"]);
	expect(JSON.parse(readFileSync(storeFile(), "utf-8")).userID).toBe("u1");
	const [manager] = await sessions();
	expect(manager!.blocked).toBe(null);
});

// A project whose trusted folders a person cleared gives trellis no
// permission, so the manager meets the dialog and the row says so.
test("a manager of a project with no trusted folder records the folder trust block", async () => {
	await enable();
	await startHost();
	await host.idle();
	const cleared = await t.api("/api/projects/CDE/trusted-folders", { method: "PUT", body: { paths: [] } });
	expect(cleared.status).toBe(200);
	writeFileSync(storeFile(), JSON.stringify({}));

	host.stop();
	host = (t.transport as InlineTransport).startAgents({ clock, log: () => undefined });
	await host.start();
	await host.idle();

	const [manager] = await sessions();
	expect(manager!.blocked).toMatchObject({ reason: "folder-trust", path: null });
	expect(trustedIn(storeFile())).toEqual([]);
});

// The person read "Off" and the log read one line. The manager row now
// carries what superset printed.
test("a manager the runner refuses becomes an exited row that carries the reason", async () => {
	await enable();
	stub.update((state) => {
		state.failures["ws create"] = "Project not found: sp-web";
	});
	await startHost();
	await host.idle();

	const [manager] = await sessions();
	expect(manager).toMatchObject({ role: "manager", state: "exited" });
	expect(manager!.blocked).toMatchObject({ reason: "runner-error" });
	expect(manager!.blocked!.detail).toContain("Project not found: sp-web");
});

// A tab that runs claude and never reaches agents.register waits for an
// answer: the trust dialog, a permission question, or a login.
test("the watchdog marks a session that holds a terminal and never registered", async () => {
	await enable();
	await startHost();
	await host.idle();
	expect((await sessions())[0]!.state).toBe("starting");

	await t.db.execute(sql`UPDATE agent_sessions SET updated_at = updated_at - interval '10 minutes'`);
	await clock.advance(WATCHDOG_MS);
	await host.idle();

	const [manager] = await sessions();
	expect(manager!.state).toBe("starting");
	expect(manager!.blocked).toMatchObject({ reason: "no-register" });
});

// A wake types into a terminal. A terminal whose agent exited runs a
// shell, so the text would run as a command; the runner starts the
// manager again instead. That restart is a change a person must find, so
// the project's activity feed carries it.
test("a wake that has to start the manager again records it in the project activity", async () => {
	await enable();
	await startHost();
	await host.idle();
	const [manager] = await sessions();
	stub.exit(manager!.terminalId!);

	await t.createTicket({ project: "CDE", title: "One" });
	await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: "look at this" } });
	await clock.advance(10_000);
	await host.idle();

	const rows = await t.db.execute(
		sql`SELECT action, field, from_value, to_value, meta FROM activity WHERE action = 'agent.restarted'`,
	);
	expect(rows.rows).toHaveLength(1);
	expect(rows.rows[0]).toMatchObject({ field: "state", from_value: "exited", to_value: "starting" });
	expect(stub.state().terminals.flatMap((terminal) => terminal.sent)).toEqual([]);
});

// The restart is the moment the person cares about: a new Claude that
// never reports itself sits at a question, and the row says so with the
// same action as any other blocked agent.
test("a relaunched manager that never registers becomes a blocked agent", async () => {
	await enable();
	await startHost();
	await host.idle();
	const [manager] = await sessions();
	stub.exit(manager!.terminalId!);

	await t.createTicket({ project: "CDE", title: "One" });
	await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: "look at this" } });
	await clock.advance(10_000);
	await host.idle();
	expect((await sessions())[0]!.state).toBe("starting");

	await t.db.execute(sql`UPDATE agent_sessions SET updated_at = updated_at - interval '10 minutes'`);
	await clock.advance(WATCHDOG_MS);
	await host.idle();

	const [after] = await sessions();
	expect(after!.blocked).toMatchObject({ reason: "no-register", path: null });
});
