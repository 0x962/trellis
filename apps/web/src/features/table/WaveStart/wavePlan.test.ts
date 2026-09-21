import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { startLabel, wavePlan } from "./wavePlan";

type Fields = {
	id: string;
	category?: TicketSummary["status"]["category"];
	name?: string;
	ready?: boolean;
	waitsOn?: string[];
};

const ticket = ({ id, category = "todo", name = "Todo", ready = true, waitsOn = [] }: Fields) =>
	({
		id,
		identifier: id,
		status: { category, name },
		ready,
		waitsOn: waitsOn.map((identifier) => ({ identifier, title: identifier, status: "started" })),
	}) as unknown as TicketSummary;

describe("wavePlan", () => {
	test("starts a ready Todo ticket that holds no agent run", () => {
		const plan = wavePlan([ticket({ id: "OP-1" })], new Set());
		expect(plan.start.map((entry) => entry.id)).toEqual(["OP-1"]);
		expect(plan.skip).toEqual([]);
	});

	test("skips a ticket that waits on another ticket and names it", () => {
		const plan = wavePlan([ticket({ id: "OP-2", ready: false, waitsOn: ["OP-32", "OP-33"] })], new Set());
		expect(plan.start).toEqual([]);
		expect(plan.skip.map((entry) => entry.reason)).toEqual(["blocked by OP-32, OP-33"]);
	});

	test("skips a ticket that holds an agent run, even when the ticket is ready", () => {
		const plan = wavePlan([ticket({ id: "OP-3" })], new Set(["OP-3"]));
		expect(plan.skip.map((entry) => entry.reason)).toEqual(["already running"]);
	});

	test("skips a ticket past Todo with its status name", () => {
		const plan = wavePlan(
			[
				ticket({ id: "OP-4", category: "done", name: "Done", ready: false }),
				ticket({ id: "OP-5", category: "started", name: "In Progress", ready: false }),
			],
			new Set(),
		);
		expect(plan.skip.map((entry) => entry.reason)).toEqual(["done", "in progress"]);
	});

	test("keeps the order of the rows in both lists", () => {
		const plan = wavePlan(
			[ticket({ id: "OP-6" }), ticket({ id: "OP-7", ready: false, waitsOn: ["OP-6"] }), ticket({ id: "OP-8" })],
			new Set(),
		);
		expect(plan.start.map((entry) => entry.id)).toEqual(["OP-6", "OP-8"]);
		expect(plan.skip.map((entry) => entry.ticket.id)).toEqual(["OP-7"]);
	});
});

describe("startLabel", () => {
	test("names the count of agents", () => {
		expect(startLabel(4)).toBe("Start 4 agents");
		expect(startLabel(1)).toBe("Start 1 agent");
	});
});
