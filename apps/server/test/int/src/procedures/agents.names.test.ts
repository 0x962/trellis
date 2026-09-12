import { describe, expect, test } from "bun:test";
import { AGENT_PERSON_NAMES } from "@trellis/api";
import { agentsHarness } from "../../../helpers/agents.ts";

// The person name of an agent. A human and the manager call an agent by
// its name, so every agent the runner starts holds one, the live agents of
// a project hold different names, and a name stays with its agent.

const a = agentsHarness();

const pool = [...AGENT_PERSON_NAMES];

describe("agent names", () => {
	test("server builder: the manager, a builder, and a reviewer each get a name of the pool", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const manager = await a.registerManager();
		const builder = await a.startBuilder(a.ticket(1));
		const prUrl = "https://github.com/acme/web/pull/7";
		const reviewer = await a.post("/api/agents/reviewer", { ticket: a.ticket(1), prUrl });
		expect(reviewer.status).toBe(200);
		for (const name of [manager.name, builder.name, reviewer.body.name]) expect(pool).toContain(name);
	});

	test("server builder: the live agents of a project hold different names", async () => {
		await a.enable({ maxConcurrent: 3 });
		for (const title of ["Fix login", "Fix logout", "Fix signup"]) {
			await a.t.createTicket({ project: a.key, title });
		}
		await a.registerManager();
		for (const number of [1, 2, 3]) await a.startBuilder(a.ticket(number));
		const names = (await a.sessions(`project=${a.key}`)).map((session) => session.name);
		expect(names).toHaveLength(4);
		expect(new Set(names).size).toBe(4);
	});

	test("server builder: a register of the same terminal keeps the name, so the name survives a restart", async () => {
		await a.enable();
		const first = await a.registerManager("claude-1");
		const second = await a.registerManager("claude-2");
		expect(second.id).toBe(first.id);
		expect(second.name).toBe(first.name);
	});

	test("server builder: a builder that starts again after a failed start takes a name no live agent holds", async () => {
		await a.enable({ maxConcurrent: 2 });
		for (const title of ["Fix login", "Fix logout"]) await a.t.createTicket({ project: a.key, title });
		a.stub.update((state) => {
			state.failures["ws create"] = "Project not found: sp-web";
		});
		expect((await a.post("/api/agents/builder", { ticket: a.ticket(1) })).status).toBe(503);
		const [failed] = await a.sessions(`project=${a.key}`);
		a.stub.update((state) => {
			delete state.failures["ws create"];
		});
		// A failed builder holds no terminal, so another agent can take the
		// name it held. The start again reuses the failed row, and that row
		// takes a free name, so the two live builders hold two names.
		await a.startBuilder(a.ticket(2));
		const again = await a.startBuilder(a.ticket(1));
		expect(again.id).toBe(failed!.id);
		expect(again.state).toBe("starting");
		expect(pool).toContain(again.name);
		const live = (await a.sessions(`project=${a.key}`)).filter((session) => session.state === "starting");
		expect(live).toHaveLength(2);
		expect(new Set(live.map((session) => session.name)).size).toBe(2);
	});

	test("server builder: the name of a builder reaches the sessions of its ticket and the agents.session event", async () => {
		await a.enable();
		await a.t.createTicket({ project: a.key, title: "Fix login" });
		const builder = await a.startBuilder(a.ticket(1));
		expect((await a.sessions(`ticket=${a.ticket(1)}`)).map((session) => session.name)).toEqual([builder.name]);
		expect(a.sessionEvents().map((session) => session.name)).toContain(builder.name);
	});
});
