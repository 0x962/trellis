import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { AgentSession, TrustedFolder } from "@trellis/api";
import { sql } from "drizzle-orm";
import { agentsHarness } from "../../test/helpers/agents.ts";
import { NAVID } from "../../test/helpers/app.ts";

// A builder that meets Claude's folder trust dialog never runs, and the
// person used to see a badge that read Starting. The session now records
// the reason, and agents.unblock trusts the folder and starts the agent
// again.

const a = agentsHarness();

const trust = (paths: string[]) =>
	a.t.api(`/api/projects/${a.key}/trusted-folders`, { method: "PUT", body: { paths }, actor: NAVID });

const foldersOf = async (): Promise<string[]> =>
	((await a.t.api(`/api/projects/${a.key}`, { actor: null })).body.trustedFolders as TrustedFolder[]).map(
		(folder) => folder.path,
	);

const trustedIn = (file: string) => {
	const state = JSON.parse(readFileSync(file, "utf-8")) as {
		projects?: Record<string, { hasTrustDialogAccepted?: boolean }>;
	};
	return Object.entries(state.projects ?? {})
		.filter(([, entry]) => entry.hasTrustDialogAccepted === true)
		.map(([path]) => path);
};

describe("a blocked builder", () => {
	// The contract tests run no agents host, so the project starts with no
	// trusted folder and the builder meets the dialog.
	test("a builder of a project with no trusted folder starts and records the folder trust block", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });

		const builder = await a.startBuilder(a.ticket(1));

		expect(builder.state).toBe("starting");
		expect(builder.blocked).toMatchObject({ reason: "folder-trust", path: null, detail: null });
		expect(builder.blocked!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	test("a builder of a project with a trusted folder carries no block and the folder reaches the Claude state file", async () => {
		await a.enable();
		expect((await trust(["/src/web"])).status).toBe(200);
		await a.t.createTicket({ project: a.key, title: "Fix login" });

		const builder = await a.startBuilder(a.ticket(1));

		expect(builder.blocked).toBe(null);
		expect(trustedIn(a.t.config.claudeStateFile)).toContain("/src/web");
	});

	// A person clicks one button. trellis trusts what the session named,
	// stops the agent that waits, and starts another in the same workspace.
	test("agents.unblock stops the blocked builder and starts a new one for the ticket", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const blocked = await a.startBuilder(a.ticket(1));
		expect((await trust(["/src/web"])).status).toBe(200);

		const response = await a.post(`/api/agents/sessions/${blocked.id}/unblock`, {});
		expect(response.status).toBe(200);
		const started = response.body as AgentSession;

		expect(started.id).not.toBe(blocked.id);
		expect(started.role).toBe("builder");
		expect(started.blocked).toBe(null);
		const rows = await a.sessions(`ticket=${a.ticket(1)}`);
		expect(rows.map((session) => session.state)).toEqual(["stopped", "starting"]);
	});

	// The list is the permission, so the one recorded folder joins it.
	test("agents.unblock adds the folder the session recorded to the project's trusted folders", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const blocked = await a.startBuilder(a.ticket(1));
		// A stalled agent that names its folder is the shape the runner
		// reports when a workspace worktree sits outside every root.
		await a.t.db.execute(sql`UPDATE agent_sessions SET blocked_path = '/src/web' WHERE id = ${blocked.id}`);

		const response = await a.post(`/api/agents/sessions/${blocked.id}/unblock`, {});
		expect(response.status).toBe(200);

		expect(await foldersOf()).toEqual(["/src/web"]);
	});

	test("agents.unblock refuses a session that carries no reason", async () => {
		await a.enable();
		expect((await trust(["/src/web"])).status).toBe(200);
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const running = await a.startBuilder(a.ticket(1));

		const refused = await a.post(`/api/agents/sessions/${running.id}/unblock`, {});
		expect(refused.status).toBe(404);
		expect(refused.body.code).toBe("NOT_FOUND");
	});
});
