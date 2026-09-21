import { describe, expect, test } from "bun:test";
import { ticketOrderChanged } from "./ticketOrderChanged";

describe("ticketOrderChanged", () => {
	test("is true when a ticket moves past another", () => {
		expect(ticketOrderChanged(["a", "b", "c"], ["b", "c", "a"])).toBe(true);
		expect(ticketOrderChanged(["a", "b", "c"], ["a", "c", "b", "d"])).toBe(true);
	});

	test("is false when tickets only join or leave the list", () => {
		expect(ticketOrderChanged(["a", "b", "c"], ["a", "b", "c"])).toBe(false);
		expect(ticketOrderChanged(["a", "b", "c"], ["a", "c"])).toBe(false);
		expect(ticketOrderChanged(["a", "c"], ["a", "b", "c", "d"])).toBe(false);
		expect(ticketOrderChanged([], ["a", "b"])).toBe(false);
	});
});
