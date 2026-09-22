import { expect, test } from "bun:test";
import { localStateItem } from "./LocalStateMenu";

test("a draft offers to mark the pull request ready for review", () => {
	expect(localStateItem("draft")).toEqual({ label: "Mark ready for review", next: "ready" });
});

test("a ready pull request offers to mark it as a draft", () => {
	expect(localStateItem("ready")).toEqual({ label: "Mark as draft", next: "draft" });
});
