import { describe, expect, test } from "bun:test";
import type { AgentRun, TicketSummary } from "@trellis/api";
import { startedRunList, startWave } from "./startWave";

const ticket = (id: string) => ({ id, identifier: id }) as unknown as TicketSummary;

const run = (id: string, ticketId: string) => ({ id, ticketId, state: "starting" }) as unknown as AgentRun;

// A promise this test resolves by hand, so one call can answer while another
// one is still open.
const openCall = () => {
	let settle!: (run: AgentRun) => void;
	const promise = new Promise<AgentRun>((resolve) => {
		settle = resolve;
	});
	return { promise, settle };
};

describe("startedRunList", () => {
	test("puts the started run first in an empty list", () => {
		expect(startedRunList(undefined, run("run-1", "OP-1"))).toEqual([run("run-1", "OP-1")]);
	});

	test("puts the started run before the runs the list already holds", () => {
		const older = run("run-0", "OP-0");
		expect(startedRunList([older], run("run-1", "OP-1"))).toEqual([run("run-1", "OP-1"), older]);
	});

	test("replaces a run the list already holds under the same id", () => {
		expect(startedRunList([run("run-1", "OP-1")], run("run-1", "OP-1"))).toEqual([run("run-1", "OP-1")]);
	});
});

describe("startWave", () => {
	test("shows and reports a run as its own call returns, before the slow call answers", async () => {
		const fast = openCall();
		const slow = openCall();
		const shown: string[] = [];
		const reported: [string, string | null][] = [];
		const wave = startWave([ticket("OP-1"), ticket("OP-2")], {
			start: (target) => (target.id === "OP-1" ? slow.promise : fast.promise),
			showRun: (started) => shown.push(started.id),
			report: (ticketId, error) => reported.push([ticketId, error]),
		});

		fast.settle(run("run-2", "OP-2"));
		// Let every microtask that the answered call queued run. The other
		// call stays open.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(shown).toEqual(["run-2"]);
		expect(reported).toEqual([["OP-2", null]]);

		slow.settle(run("run-1", "OP-1"));
		expect(await wave).toBe(true);
		expect(shown).toEqual(["run-2", "run-1"]);
		expect(reported).toEqual([
			["OP-2", null],
			["OP-1", null],
		]);
	});

	test("names the ticket whose start failed and shows no run for it", async () => {
		const shown: string[] = [];
		const reported: [string, string | null][] = [];
		const started = await startWave([ticket("OP-1"), ticket("OP-2")], {
			start: (target) =>
				target.id === "OP-1"
					? Promise.reject(new Error("No account is signed in."))
					: Promise.resolve(run("run-2", "OP-2")),
			showRun: (item) => shown.push(item.id),
			report: (ticketId, error) => reported.push([ticketId, error]),
		});

		expect(started).toBe(false);
		expect(shown).toEqual(["run-2"]);
		expect(reported).toContainEqual(["OP-1", "No account is signed in."]);
		expect(reported).toContainEqual(["OP-2", null]);
	});
});
