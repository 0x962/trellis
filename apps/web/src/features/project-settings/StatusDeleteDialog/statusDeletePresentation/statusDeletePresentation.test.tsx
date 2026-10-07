import { expect, test } from "bun:test";
import { statusDeletePresentation } from "./statusDeletePresentation";

test("ticket effects and replacement are explicit before deletion", () => {
	const state = statusDeletePresentation(3, false, "");
	expect(state.description).toBe("3 tickets use this status. Select a status to move them to.");
	expect(state.needsReplacement).toBe(true);
	expect(state.confirmDisabled).toBe(true);
	expect(statusDeletePresentation(3, false, "done").confirmDisabled).toBe(false);
});

test("the last status explains why deletion is unavailable", () => {
	const state = statusDeletePresentation(0, true, "");
	expect(state.description).toBe("A project keeps at least one status. Add another status before you delete this one.");
	expect(state.needsReplacement).toBe(false);
	expect(state.confirmDisabled).toBe(true);
});
