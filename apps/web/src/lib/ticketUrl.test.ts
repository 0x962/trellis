import { expect, test } from "bun:test";
import { ticketRefOfPathname } from "./ticketUrl";

test("a ticket path gives its ref, and another path gives none", () => {
	expect(ticketRefOfPathname("/t/TRL-386")).toBe("TRL-386");
	expect(ticketRefOfPathname("/t/TRL%2D386")).toBe("TRL-386");
	expect(ticketRefOfPathname("/t/")).toBeNull();
	expect(ticketRefOfPathname("/p/TRL")).toBeNull();
	expect(ticketRefOfPathname("/needs-you")).toBeNull();
});
