import { afterEach, beforeEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { managerTools } from "../../../../../src/agents/managerTools/managerTools.ts";
import { observeRuns } from "../../../../../src/services/agentRuns/liveState.ts";
import type { StoredRun } from "../../../../../src/services/agentRuns/queries.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
const attempt = { id: "working-attempt", token: "fixture-token" };
beforeEach(async () => {
	fixture = await harnessHostFixture({ nestedRuntime: true });
});
afterEach(async () => {
	await fixture.client.shutdown();
	await new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await rm(fixture.home, { recursive: true, force: true });
});
const run: StoredRun = {
	id: "worker",
	name: "Worker",
	runtime: "native",
	personaId: null,
	personaName: "Builder",
	kind: "builder",
	instruction: "Work",
	projectId: null,
	projectPath: "HOST",
	ticketId: null,
	ticketIdentifier: null,
	closedAt: null,
	workspaceId: "/tmp",
	terminalId: attempt.id,
	url: null,
	error: null,
	sessionId: "saved-session",
	sessionLost: false,
	createdAt: "2026-09-15T22:00:00.000Z",
	updatedAt: "2026-09-15T22:00:00.000Z",
};

test("manager list checks the OS after a working agent dies and retains its old turn separately", async () => {
	const started = await fixture.client.start({
		id: attempt.id,
		command: "/bin/cat",
		args: [],
		cwd: fixture.home,
		env: { TRELLIS_ATTEMPT_TOKEN: attempt.token },
		mode: "pty",
	});
	await fixture.client.observe(attempt.id, attempt.token, { kind: "working", turnId: "active-turn" });
	const tools = managerTools(async () => observeRuns({ home: fixture.home }, [run]));
	const before = await tools.call("trellis_agentRuns_list", { project: "HOST" });
	expect(before).toMatchObject({ items: [{ processStatus: "running", working: true, replacementAllowed: false }] });
	process.kill(started.pid!, "SIGKILL");
	await fixture.host.waitFor(attempt.id, (session) => session.status === "exited");
	const after = await tools.call("trellis_agentRuns_list", { project: "HOST" });
	expect(after).toMatchObject({
		items: [
			{
				processStatus: "exited",
				working: false,
				replacementAllowed: true,
				observation: { activity: { state: "working" }, turnId: "active-turn", controllable: false },
			},
		],
	});
});
