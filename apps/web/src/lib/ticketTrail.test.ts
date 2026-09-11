import { describe, expect, test } from "bun:test";
import { gap, ticketTrail } from "./ticketTrail";

describe("ticketTrail", () => {
	test("a ticket with no parent is its own trail", () => {
		expect(ticketTrail([], "OP-9")).toEqual(["OP-9"]);
	});

	test("a parent and a grandparent both print", () => {
		expect(ticketTrail(["OP-4"], "OP-9")).toEqual(["OP-4", "OP-9"]);
		expect(ticketTrail(["OP-4", "OP-6"], "OP-9")).toEqual(["OP-4", "OP-6", "OP-9"]);
	});

	test("a deeper tree keeps the top, the parent, and the ticket", () => {
		expect(ticketTrail(["OP-4", "OP-6", "OP-9"], "OP-10")).toEqual(["OP-4", gap, "OP-9", "OP-10"]);
		expect(ticketTrail(["OP-1", "OP-2", "OP-3", "OP-4", "OP-9"], "OP-10")).toEqual(["OP-1", gap, "OP-9", "OP-10"]);
	});
});
