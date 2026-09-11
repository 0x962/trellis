import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { agentLaunch, resumeCommand } from "@trellis/api";
import { gitRepo } from "../../test/helpers/gitRepo.ts";
import { flagOf, type SupersetStubHandle, supersetStub } from "../../test/helpers/superset-stub.ts";
import type { Runner } from "./runner.ts";
import { createSupersetRunner } from "./supersetRunner.ts";

// The runner spawns the fake superset binary from test/stubs/superset.ts,
// which records every argument list and keeps its workspaces and terminals
// in a state file, so a later spawn sees what an earlier spawn made.

const url = "http://127.0.0.1:4521";
let stub: SupersetStubHandle;
let runner: Runner;

beforeEach(() => {
	stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
		projects: [
			{ id: "sp-web", name: "web", repo: "https://github.com/Acme/Web.git", path: "/src/web" },
			{ id: "sp-api", name: "api", repo: "acme/api", path: "/src/api" },
		],
	});
	runner = createSupersetRunner({ bin: stub.bin, url });
});
afterEach(() => stub.restore());

// `host` null runs every agent on this machine, which is what a project
// without a Superset host does.
const start = { project: "CDE", runnerProjectId: "sp-web", host: null, baseBranch: "main" };
const manager = { ...start, claudeSessionId: null };
const builder = { ...start, ticket: "CDE-42", title: "Fix login" };

// The rejection of `promise` as the declared runner error, with its reason.
const reasonOf = async (promise: Promise<unknown>) => {
	const error = await promise.then(
		() => null,
		(caught: unknown) => caught,
	);
	expect(error).toBeInstanceOf(ORPCError);
	expect((error as ORPCError<string, unknown>).code).toBe("RUNNER_UNAVAILABLE");
	return ((error as ORPCError<string, { reason: string }>).data as { reason: string }).reason;
};

describe("projectFor", () => {
	test("matches a declared repo to the Superset project whose repo names it, in any case and form", async () => {
		expect(await runner.projectFor([{ owner: "acme", repo: "web" }])).toBe("sp-web");
		expect(
			await runner.projectFor([
				{ owner: "other", repo: "x" },
				{ owner: "acme", repo: "api" },
			]),
		).toBe("sp-api");
		expect(stub.callsOf("projects list")[0]).toEqual(["projects", "list", "--json"]);
	});

	test("answers RUNNER_UNAVAILABLE unmapped when no Superset project names a declared repo", async () => {
		expect(await reasonOf(runner.projectFor([{ owner: "acme", repo: "mobile" }]))).toBe("unmapped");
		expect(await reasonOf(runner.projectFor([]))).toBe("unmapped");
	});
});

describe("ensureManager", () => {
	test("creates the manager workspace on its own branch with the manager tab and the project tag", async () => {
		const started = await runner.ensureManager(manager);
		const [call] = stub.callsOf("ws create");
		expect(call).toEqual([
			...["ws", "create", "--local", "--project", "sp-web", "--name", "CDE · manager"],
			...["--branch", "trellis-cde-manager", "--skip-branch-prefix", "--base-branch", "main"],
			...["--tag", "trellis-cde", "--command", agentLaunch({ role: "manager", project: "CDE", url }).command, "--json"],
		]);
		const workspace = stub.state().workspaces[0]!;
		expect(started).toEqual({
			workspaceId: workspace.id,
			terminalId: stub.state().terminals[0]!.terminalId,
			openUrl: `superset://workspace/${workspace.id}`,
			started: true,
		});
		expect(stub.terminal(started.terminalId).title).toBe("CDE manager");
	});

	test("a second call finds the workspace by its branch and the live manager tab, and starts nothing", async () => {
		const first = await runner.ensureManager(manager);
		const second = await runner.ensureManager(manager);
		expect(second).toEqual({ ...first, started: false });
		expect(stub.state().workspaces).toHaveLength(1);
		expect(stub.state().terminals).toHaveLength(1);
		expect(stub.callsOf("terminals create")).toEqual([]);
	});

	test("an exited manager tab in the workspace gets a new tab that resumes the Claude session", async () => {
		const first = await runner.ensureManager(manager);
		stub.exit(first.terminalId);
		const text = "trellis: the server restarted. Run: trellis agents inbox --project CDE";
		const second = await runner.ensureManager({ ...manager, claudeSessionId: "claude-1", text });
		expect(second.started).toBe(true);
		expect(second.terminalId).not.toBe(first.terminalId);
		const [create] = stub.callsOf("terminals create");
		expect(flagOf(create!, "--workspace")).toBe(first.workspaceId);
		expect(flagOf(create!, "--command")).toBe(resumeCommand({ project: "CDE", sessionId: "claude-1", text, url }));
	});
});

describe("startBuilder", () => {
	test("names the workspace after the ticket, tags it with the project, and branches from the base", async () => {
		const started = await runner.startBuilder(builder);
		const [call] = stub.callsOf("ws create");
		expect(call).toEqual([
			...["ws", "create", "--local", "--project", "sp-web", "--name", "CDE-42"],
			...["--branch", "cde-42-fix-login", "--skip-branch-prefix", "--base-branch", "main", "--tag", "trellis-cde"],
			...["--command", agentLaunch({ role: "builder", project: "CDE", ticket: "CDE-42", url }).command, "--json"],
		]);
		expect(stub.state().workspaces[0]).toMatchObject({
			name: "CDE-42",
			tag: "trellis-cde",
			branch: "cde-42-fix-login",
		});
		expect(started.openUrl).toBe(`superset://workspace/${started.workspaceId}`);
		const listed = await runner.terminals(started.workspaceId, null);
		expect(listed).toEqual([{ terminalId: started.terminalId, exited: false, title: "CDE-42" }]);
	});

	test("a second start of the same ticket reuses the workspace and its live builder tab", async () => {
		const first = await runner.startBuilder(builder);
		const second = await runner.startBuilder(builder);
		expect(second).toEqual(first);
		expect(stub.state().terminals).toHaveLength(1);
	});

	test("answers RUNNER_UNAVAILABLE error when superset exits nonzero, and missing when the binary is absent", async () => {
		stub.update((state) => {
			state.failures["ws create"] = "Project not found: sp-web";
		});
		expect(await reasonOf(runner.startBuilder(builder))).toBe("error");
		const absent = createSupersetRunner({ bin: join(process.env.TRELLIS_HOME!, "no-superset"), url });
		expect(await reasonOf(absent.startBuilder(builder))).toBe("missing");
	});
});

describe("startReviewer", () => {
	test("opens a tab named '<ticket> review' in the builder's workspace with the reviewer prompt", async () => {
		const built = await runner.startBuilder(builder);
		const prUrl = "https://github.com/acme/web/pull/7";
		const reviewer = await runner.startReviewer({
			project: "CDE",
			ticket: "CDE-42",
			prUrl,
			workspaceId: built.workspaceId,
			host: null,
		});
		const [create] = stub.callsOf("terminals create");
		expect(create).toEqual([
			...["terminals", "create", "--workspace", built.workspaceId],
			...[
				"--command",
				agentLaunch({ role: "reviewer", project: "CDE", ticket: "CDE-42", prUrl, url }).command,
				"--json",
			],
		]);
		expect(stub.terminal(reviewer.terminalId).title).toBe("CDE-42 review");
	});
});

describe("wake", () => {
	test("types the text into a live terminal after it checks the terminal list", async () => {
		const started = await runner.ensureManager(manager);
		const session = {
			project: "CDE",
			workspaceId: started.workspaceId,
			terminalId: started.terminalId,
			host: null,
			claudeSessionId: null,
		};
		const woken = await runner.wake(session, "trellis: 2 changes in CDE");
		expect(woken).toEqual({ terminalId: started.terminalId, relaunched: false });
		const calls = stub.calls().map((call) => `${call[0]} ${call[1]}`);
		expect(calls.slice(-2)).toEqual(["terminals list", "terminals send"]);
		expect(stub.callsOf("terminals send")[0]).toEqual([
			...["terminals", "send", "--workspace", started.workspaceId, "--terminal", started.terminalId],
			...["--text", "trellis: 2 changes in CDE"],
		]);
		expect(stub.terminal(started.terminalId).sent).toEqual(["trellis: 2 changes in CDE"]);
	});

	test("never types into an exited terminal; it relaunches the manager resuming its session with the text", async () => {
		const started = await runner.ensureManager(manager);
		stub.exit(started.terminalId);
		const session = {
			project: "CDE",
			workspaceId: started.workspaceId,
			terminalId: started.terminalId,
			host: null,
			claudeSessionId: "c-9",
		};
		const woken = await runner.wake(session, "trellis: 1 change in CDE");
		expect(woken.relaunched).toBe(true);
		expect(woken.terminalId).not.toBe(started.terminalId);
		expect(stub.callsOf("terminals send")).toEqual([]);
		const command = flagOf(stub.callsOf("terminals create")[0]!, "--command");
		expect(command).toBe(resumeCommand({ project: "CDE", sessionId: "c-9", text: "trellis: 1 change in CDE", url }));
		expect(stub.terminal(woken.terminalId).title).toBe("CDE manager");
	});

	test("a closed terminal without a Claude session gets a fresh manager", async () => {
		const started = await runner.ensureManager(manager);
		stub.update((state) => {
			state.terminals = [];
		});
		const session = {
			project: "CDE",
			workspaceId: started.workspaceId,
			terminalId: started.terminalId,
			host: null,
			claudeSessionId: null,
		};
		const woken = await runner.wake(session, "trellis: 1 change in CDE");
		expect(woken.relaunched).toBe(true);
		const command = flagOf(stub.callsOf("terminals create")[0]!, "--command");
		expect(command).toBe(agentLaunch({ role: "manager", project: "CDE", url }).command);
	});
});

describe("isAlive, stop, removeWorkspace", () => {
	test("isAlive reads the terminal list, and stop closes a listed terminal", async () => {
		const started = await runner.startBuilder(builder);
		const ref = { workspaceId: started.workspaceId, terminalId: started.terminalId, host: null };
		expect(await runner.isAlive(ref)).toBe(true);
		await runner.stop(ref);
		expect(stub.callsOf("terminals close")[0]).toEqual([
			...["terminals", "close", "--workspace", started.workspaceId, "--terminal", started.terminalId],
		]);
		expect(await runner.isAlive(ref)).toBe(false);
		await runner.stop(ref);
		expect(stub.callsOf("terminals close")).toHaveLength(1);
	});

	test("removeWorkspace deletes the local worktree and keeps the branch", async () => {
		const started = await runner.startBuilder(builder);
		await runner.removeWorkspace(started.workspaceId, null);
		expect(stub.callsOf("ws delete")[0]).toEqual(["ws", "delete", started.workspaceId, "--local"]);
		expect(stub.state().workspaces).toEqual([]);
	});
});

describe("the agent's terminal", () => {
	// For a project with a setup script, Superset lists the setup terminal
	// first. That terminal exits when the script ends, so an agent recorded
	// there reads as exited and gets a second Claude.
	test("ensureManager and startBuilder take the Command terminal, never the Workspace Setup terminal", async () => {
		stub.update((state) => {
			state.setupTerminal = true;
		});
		const started = await runner.ensureManager(manager);
		expect(stub.terminal(started.terminalId)).toMatchObject({ label: "Command", title: "CDE manager" });
		const built = await runner.startBuilder(builder);
		expect(stub.terminal(built.terminalId)).toMatchObject({ label: "Command", title: "CDE-42" });
		expect(stub.state().terminals.filter((tab) => tab.label === "Workspace Setup")).toHaveLength(2);
	});
});

describe("runner errors", () => {
	test("an error superset prints on stdout reaches the message when stderr is empty", async () => {
		stub.update((state) => {
			state.stdoutFailures = { "ws create": '{"error":"fatal: invalid reference: main"}' };
		});
		const error = await runner.ensureManager(manager).then(
			() => null,
			(caught: unknown) => caught as Error,
		);
		expect(error!.message).toContain("superset ws create: ");
		expect(error!.message).toContain("fatal: invalid reference: main");
	});
});

describe("defaultBranch", () => {
	test("reads origin/HEAD in the checkout of the Superset project, without refs/remotes/origin/", async () => {
		const path = gitRepo("master");
		stub.update((state) => {
			state.projects[0]!.path = path;
		});
		expect(await runner.defaultBranch("sp-web")).toBe("master");
	});

	test("a checkout without origin/HEAD answers RUNNER_UNAVAILABLE error with the path in the message", async () => {
		const path = gitRepo(null);
		stub.update((state) => {
			state.projects[0]!.path = path;
		});
		expect(await reasonOf(runner.defaultBranch("sp-web"))).toBe("error");
		const error = await runner.defaultBranch("sp-web").then(
			() => null,
			(caught: unknown) => caught as Error,
		);
		expect(error!.message).toContain(path);
	});
});
