import { expect, test } from "bun:test";
import { localStateItem } from "./LocalStateMenu";

test("a pull request that nobody asked to review offers to ask", () => {
	expect(localStateItem("not-ready")).toEqual({ label: "Ask for review", next: "ready" });
});

test("a pull request the agent asked to review offers to take the ask back", () => {
	expect(localStateItem("ready")).toEqual({ label: "Mark as not ready for review", next: "not-ready" });
});
