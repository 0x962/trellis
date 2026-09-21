import { expect, test } from "bun:test";
import { sortLabel } from "./labels";

test("the default updated sort label matches the display field", () => {
	expect(sortLabel("-updatedAt")).toBe("Sorted by updated");
});

test("ascending date sorts name oldest first", () => {
	expect(sortLabel("createdAt")).toBe("Sorted by created, oldest first");
});
