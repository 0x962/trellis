import { describe, expect, test } from "bun:test";
import { agentsHostHarness } from "../../test/helpers/agentsHost.ts";
import { flagOf } from "../../test/helpers/superset-stub.ts";

// The heartbeat types PING into the manager's terminal on the project's
// interval, so a manager that is idle, stuck, or dead gets a turn while
// nothing changes. Every ping writes one row that the Agents page reads.
// These tests use the inline transport, the fake superset, and a fake clock.

const a = agentsHostHarness();

describe("agents heartbeat", () => {
	test("the interval fires at the configured time and each ping writes a row", async () => {
		const project = await a.enable(true, 60);
		await a.startHost();
		await a.clock.advance(59_000);
		expect(a.sent()).toEqual([]);
		await a.clock.advance(1_000);
		expect(a.sent()).toEqual(["PING"]);
		await a.clock.advance(60_000);
		expect(a.sent()).toEqual(["PING", "PING"]);
		expect((await a.pings()).map(({ projectId, restarted }) => ({ projectId, restarted }))).toEqual([
			{ projectId: project.id, restarted: false },
			{ projectId: project.id, restarted: false },
		]);
		expect(a.events.filter((event) => event.type === "agents.ping")).toHaveLength(2);
	});

	// The batch goes out at 55 s, five seconds before the first ping was due.
	// The next ping is then 60 s after the batch, at 115 s.
	test("a batch resets the timer, so a manager that just answered gets no ping", async () => {
		await a.enable(true, 60);
		await a.startHost();
		await a.clock.advance(45_000);
		await a.t.createTicket({ project: "CDE", title: "Fix login" });
		await a.clock.advance(10_000);
		expect(a.sent()).toHaveLength(1);
		expect(a.sent()[0]!.startsWith("trellis: 1 change in CDE")).toBe(true);
		await a.clock.advance(59_000);
		expect(a.sent()).toHaveLength(1);
		await a.clock.advance(1_000);
		expect(a.sent()[1]).toBe("PING");
	});

	// A dead terminal never gets typed into: text typed into a bare shell
	// would run as a command. The runner starts the manager again with PING
	// as its prompt, and the row records the restart.
	test("a stopped manager is started again before the ping, and the row says the ping forced a restart", async () => {
		await a.enable(true, 60);
		await a.startHost();
		const [manager] = await a.sessions();
		await a.registerManager(manager!, "c-1");
		a.stub.exit(manager!.terminalId!);
		await a.clock.advance(60_000);
		const [relaunch] = a.stub.callsOf("terminals create");
		expect(flagOf(relaunch!, "--command")).toContain("--resume 'c-1'");
		expect(flagOf(relaunch!, "--command")).toContain("PING");
		expect((await a.pings()).map((ping) => ping.restarted)).toEqual([true]);
		const [after] = await a.sessions();
		expect(after).toMatchObject({ id: manager!.id, state: "running" });
		expect(after!.terminalId).not.toBe(manager!.terminalId);
	});

	// A ping is not a batch, so it moves no cursor and sets no wake time.
	test("a ping leaves lastWokenAt alone", async () => {
		await a.enable(true, 60);
		await a.startHost();
		await a.clock.advance(60_000);
		expect(a.sent()).toEqual(["PING"]);
		expect((await a.sessions())[0]!.lastWokenAt).toBeNull();
	});

	test("no heartbeat runs while the interval is off or the project's manager is off", async () => {
		const project = await a.enable(true, null);
		await a.startHost();
		await a.clock.advance(600_000);
		expect(a.sent()).toEqual([]);
		expect(await a.pings()).toEqual([]);

		await a.setSettings(project, true, 15);
		await a.host.idle();
		await a.clock.advance(15_000);
		expect(a.sent()).toEqual(["PING"]);

		await a.setSettings(project, false, 15);
		await a.host.idle();
		await a.clock.advance(600_000);
		expect(a.sent()).toHaveLength(1);
	});
});
