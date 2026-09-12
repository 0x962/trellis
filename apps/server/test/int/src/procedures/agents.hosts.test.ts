import { describe, expect, test } from "bun:test";
import { agentsHarness } from "../../../helpers/agents.ts";
import { flagOf } from "../../../helpers/superset-stub.ts";

// The Superset host of a project. A project that names none runs its agents
// on the machine that runs the trellis server, which is what `--local`
// means. A project that names one passes that id to every workspace and
// terminal the runner makes for it.

const a = agentsHarness();

const MINI = "04705517c8ad3a6d7f595f395125ecfe";
const CANARY = "d7701453b49179bbfd6624c562b9b7c8";

// One online host and one offline host, as `superset hosts list --json`
// prints them.
const withHosts = () =>
	a.stub.update((state) => {
		state.hosts = [
			{ id: MINI, name: "Navids-Mac-mini", online: "yes" },
			{ id: CANARY, name: "Canary-JQV57W1HPL", online: "no" },
		];
	});

describe("agents.runnerHosts", () => {
	test("lists the online hosts with their ids and names, and leaves the offline ones out", async () => {
		withHosts();
		const listed = await a.t.api("/api/agents/runner-hosts", { actor: null });
		expect(listed.status).toBe(200);
		expect(listed.body).toEqual({ hosts: [{ id: MINI, name: "Navids-Mac-mini" }] });
		expect(a.stub.callsOf("hosts list")[0]).toEqual(["hosts", "list", "--json"]);
	});

	test("answers RUNNER_UNAVAILABLE missing when the superset binary is not on the machine", async () => {
		a.removeBin();
		const refused = await a.t.api("/api/agents/runner-hosts", { actor: null });
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "missing" } });
	});
});

describe("the Superset host of a project", () => {
	test("a project that names no host keeps --local and passes --host nowhere", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const started = await a.startBuilder(a.ticket(1));
		expect(a.stub.callsOf("ws create")[0]).toContain("--local");
		await a.post("/api/agents/wake", { project: a.key, text: `trellis: 1 change in ${a.key}` });
		await a.post(`/api/agents/sessions/${started.id}/stop`, {});
		for (const call of a.stub.calls()) expect(call, call.join(" ")).not.toContain("--host");
	});

	test("a project that names a host passes --host to ws create, terminals create, and terminals send", async () => {
		withHosts();
		await a.enable({ supersetHostId: MINI });
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const started = await a.startBuilder(a.ticket(1));
		const [create] = a.stub.callsOf("ws create");
		expect(flagOf(create!, "--host")).toBe(MINI);
		expect(create).not.toContain("--local");
		expect(a.stub.state().workspaces.at(-1)!.host).toBe(MINI);

		const prUrl = "https://github.com/acme/web/pull/7";
		const review = await a.post("/api/agents/reviewer", { ticket: a.ticket(1), prUrl });
		expect(review.status).toBe(200);
		expect(flagOf(a.stub.callsOf("terminals create").at(-1)!, "--host")).toBe(MINI);

		await a.registerManager();
		const woken = await a.post("/api/agents/wake", { project: a.key, text: `trellis: 1 change in ${a.key}` });
		expect(woken.status).toBe(200);
		expect(flagOf(a.stub.callsOf("terminals send").at(-1)!, "--host")).toBe(MINI);

		const stopped = await a.post(`/api/agents/sessions/${started.id}/stop`, {});
		expect(stopped.status).toBe(200);
		expect(flagOf(a.stub.callsOf("terminals close").at(-1)!, "--host")).toBe(MINI);
	});

	// The manager reads this message from `trellis agents start` and writes
	// it to the ticket, as it does for any other refused start.
	test("an offline host fails the builder start with the reason host and the machine name on the session", async () => {
		withHosts();
		await a.enable({ supersetHostId: CANARY });
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const refused = await a.post("/api/agents/builder", { ticket: a.ticket(1) });
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "host" } });
		expect(refused.body.message).toContain("Canary-JQV57W1HPL");
		expect(refused.body.message).toContain("offline");
		expect(a.stub.callsOf("ws create")).toEqual([]);
		const [failed] = await a.sessions(`project=${a.key}`);
		expect(failed).toMatchObject({ role: "builder", state: "failed", workspaceId: null });
		expect(failed!.error).toContain("Canary-JQV57W1HPL");
	});

	test("a host id that no host carries fails the start with the reason host and names the id", async () => {
		withHosts();
		const gone = "ffffffffffffffffffffffffffffffff";
		await a.enable({ supersetHostId: gone });
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const refused = await a.post("/api/agents/builder", { ticket: a.ticket(1) });
		expect(refused.status).toBe(503);
		expect(refused.body).toMatchObject({ code: "RUNNER_UNAVAILABLE", data: { reason: "host" } });
		expect(refused.body.message).toContain(gone);
		expect(a.stub.callsOf("ws create")).toEqual([]);
	});

	// A host that is offline now was reachable when the setting was saved,
	// so the save keeps it and only the start refuses.
	test("the settings save keeps an offline host and reads it back", async () => {
		withHosts();
		const project = await a.enable({ supersetHostId: CANARY });
		const read = await a.t.api("/api/agents/settings", { actor: null });
		expect(read.status).toBe(200);
		const row = read.body.projects.find((entry: { projectId: string }) => entry.projectId === project.id);
		expect(row.supersetHostId).toBe(CANARY);
	});
});
