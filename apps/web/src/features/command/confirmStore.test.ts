import { describe, expect, test } from "bun:test";
import { askConfirm, confirmActions, useConfirmStore } from "./confirmStore";

describe("confirmStore", () => {
	test("Delete answers the waiting action with true", async () => {
		const answer = askConfirm("Delete CDE-42?");
		expect(useConfirmStore.getState()).toEqual({ question: "Delete CDE-42?", open: true });
		confirmActions.answer(true);
		expect(await answer).toBe(true);
		expect(useConfirmStore.getState().open).toBe(false);
	});

	test("Cancel answers the waiting action with false", async () => {
		const answer = askConfirm("Delete 3 tickets?");
		confirmActions.answer(false);
		expect(await answer).toBe(false);
		expect(useConfirmStore.getState().open).toBe(false);
	});

	// The dialog stays on screen while it closes, so it keeps the question it
	// asked until the next one replaces it.
	test("the question stays after the answer", () => {
		void askConfirm("Delete CDE-42?");
		confirmActions.answer(false);
		expect(useConfirmStore.getState().question).toBe("Delete CDE-42?");
	});
});
