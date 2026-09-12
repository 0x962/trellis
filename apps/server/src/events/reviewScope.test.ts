import { expect, test } from "bun:test";
import { matches } from "./bus";

test("scopes standalone reviews to their PR without broadcasting them into projects", () => {
	const event = { type: "reviews.changed" as const, id: "pr-one", ticketIds: [], projectIds: [] };
	expect(matches(event, {})).toBe(true);
	expect(matches(event, { projectIds: ["p"] })).toBe(false);
	expect(matches(event, { prIds: ["pr-one"] })).toBe(true);
	expect(matches(event, { prIds: ["pr-two"] })).toBe(false);
});
