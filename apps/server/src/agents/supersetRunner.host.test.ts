import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { flagOf, type SupersetStubHandle, supersetStub } from "../../test/helpers/superset-stub.ts";
import type { Runner } from "./runner.ts";
import { createSupersetRunner } from "./supersetRunner.ts";

// The Superset host of a project, as the runner sees it. A project that
// names no host keeps `--local`, which is the machine that runs the trellis
// server. A project that names one passes `--host <machineId>` to every
// workspace and terminal the runner makes for it.

const url = "http://127.0.0.1:4521";
let stub: SupersetStubHandle;
let runner: Runner;

beforeEach(() => {
	stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
		projects: [{ id: "sp-web", name: "web", repo: "https://github.com/Acme/Web.git", path: "/src/web" }],
	});
	runner = createSupersetRunner({ bin: stub.bin, url });
});
afterEach(() => stub.restore());

const start = { project: "CDE", runnerProjectId: "sp-web", host: null, baseBranch: "main" };
const manager = { ...start, claudeSessionId: null };
const builder = { ...start, ticket: "CDE-42", title: "Fix login" };

// The id and the name of the two machines the host tests run against.
const MINI = "04705517c8ad3a6d7f595f395125ecfe";
const CANARY = "d7701453b49179bbfd6624c562b9b7c8";

// Puts one online host and one offline host in the stub's host list.
const withHosts = () =>
	stub.update((state) => {
		state.hosts = [
			{ id: MINI, name: "Navids-Mac-mini", online: "yes" },
			{ id: CANARY, name: "Canary-JQV57W1HPL", online: "no" },
		];
	});

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

describe("the Superset host of a project", () => {
	test("a project with no host keeps --local on ws create and names no host anywhere else", async () => {
		const started = await runner.startBuilder(builder);
		expect(stub.callsOf("ws create")[0]).toContain("--local");
		await runner.startReviewer({
			project: "CDE",
			ticket: "CDE-42",
			prUrl: "https://github.com/acme/web/pull/7",
			workspaceId: started.workspaceId,
			host: null,
		});
		await runner.wake(
			{
				project: "CDE",
				workspaceId: started.workspaceId,
				terminalId: started.terminalId,
				host: null,
				claudeSessionId: null,
			},
			"trellis: 1 change in CDE",
		);
		for (const call of stub.calls()) expect(call, call.join(" ")).not.toContain("--host");
		expect(stub.callsOf("hosts list")).toEqual([]);
	});

	test("a project with a host passes --host to ws create, terminals create, and terminals send", async () => {
		withHosts();
		const onMini = { ...builder, host: MINI };
		const started = await runner.startBuilder(onMini);
		const [create] = stub.callsOf("ws create");
		expect(flagOf(create!, "--host")).toBe(MINI);
		expect(create).not.toContain("--local");
		expect(stub.state().workspaces[0]!.host).toBe(MINI);

		await runner.startReviewer({
			project: "CDE",
			ticket: "CDE-42",
			prUrl: "https://github.com/acme/web/pull/7",
			workspaceId: started.workspaceId,
			host: MINI,
		});
		expect(flagOf(stub.callsOf("terminals create")[0]!, "--host")).toBe(MINI);

		const session = {
			project: "CDE",
			workspaceId: started.workspaceId,
			terminalId: started.terminalId,
			host: MINI,
			claudeSessionId: null,
		};
		await runner.wake(session, "trellis: 1 change in CDE");
		expect(flagOf(stub.callsOf("terminals send")[0]!, "--host")).toBe(MINI);
		expect(stub.terminal(started.terminalId).sent).toEqual(["trellis: 1 change in CDE"]);
	});

	test("the terminal list, the terminal close, the deep link, and the delete name the host too", async () => {
		withHosts();
		const started = await runner.startBuilder({ ...builder, host: MINI });
		const ref = { workspaceId: started.workspaceId, terminalId: started.terminalId, host: MINI };
		expect(await runner.isAlive(ref)).toBe(true);
		expect(flagOf(stub.callsOf("terminals list")[0]!, "--host")).toBe(MINI);
		await runner.stop(ref);
		expect(flagOf(stub.callsOf("terminals close")[0]!, "--host")).toBe(MINI);
		expect(flagOf(stub.callsOf("ws open")[0]!, "--host")).toBe(MINI);
		await runner.removeWorkspace(started.workspaceId, MINI);
		const [remove] = stub.callsOf("ws delete");
		expect(flagOf(remove!, "--host")).toBe(MINI);
		expect(remove).not.toContain("--local");
	});

	test("hosts reads the list and turns the yes and no of superset into a boolean", async () => {
		withHosts();
		expect(await runner.hosts()).toEqual([
			{ id: MINI, name: "Navids-Mac-mini", online: true },
			{ id: CANARY, name: "Canary-JQV57W1HPL", online: false },
		]);
		expect(stub.callsOf("hosts list")[0]).toEqual(["hosts", "list", "--json"]);
	});

	test("an offline host fails every start with the reason host and names the machine, and creates nothing", async () => {
		withHosts();
		const offline = { ...builder, host: CANARY };
		expect(await reasonOf(runner.startBuilder(offline))).toBe("host");
		const error = await runner.startBuilder(offline).then(
			() => null,
			(caught: unknown) => caught as Error,
		);
		expect(error!.message).toContain("Canary-JQV57W1HPL");
		expect(error!.message).toContain("offline");
		expect(stub.callsOf("ws create")).toEqual([]);
		expect(await reasonOf(runner.ensureManager({ ...manager, host: CANARY }))).toBe("host");
		expect(
			await reasonOf(
				runner.startReviewer({
					project: "CDE",
					ticket: "CDE-42",
					prUrl: "https://github.com/acme/web/pull/7",
					workspaceId: "ws-1",
					host: CANARY,
				}),
			),
		).toBe("host");
		expect(
			await reasonOf(
				runner.wake(
					{ project: "CDE", workspaceId: "ws-1", terminalId: "t-1", host: CANARY, claudeSessionId: null },
					"trellis: 1 change in CDE",
				),
			),
		).toBe("host");
	});

	test("a host id no host carries fails the start with the reason host and names the id", async () => {
		withHosts();
		const gone = "ffffffffffffffffffffffffffffffff";
		expect(await reasonOf(runner.startBuilder({ ...builder, host: gone }))).toBe("host");
		const error = await runner.ensureManager({ ...manager, host: gone }).then(
			() => null,
			(caught: unknown) => caught as Error,
		);
		expect(error!.message).toContain(gone);
		expect(stub.callsOf("ws create")).toEqual([]);
	});
});
