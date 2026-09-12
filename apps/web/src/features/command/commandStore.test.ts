import { beforeEach, describe, expect, test } from "bun:test";
import { commandActions, contextTicket, useCommandStore } from "./commandStore";

const state = () => useCommandStore.getState();

beforeEach(() => {
	useCommandStore.setState({
		open: false,
		mode: "commands",
		pathname: "/p/CDE",
		focusedTicket: null,
		selection: [],
	});
});

describe("features/command/commandStore", () => {
	// CS-01
	test("the store takes the focused ticket from the list", () => {
		commandActions.setFocusedTicket("CDE-42");
		expect(state().focusedTicket).toBe("CDE-42");
		expect(contextTicket(state())).toBe("CDE-42");
	});

	// CS-03
	test("the store clears the selection when the list clears it", () => {
		commandActions.setSelection(["CDE-42", "CDE-44", "CDE-41"]);
		expect(state().selection).toEqual(["CDE-42", "CDE-44", "CDE-41"]);
		commandActions.setSelection([]);
		expect(state().selection).toEqual([]);
	});

	// CS-04. The context belongs to one route. A stale ticket would act on
	// a row the person left behind.
	test("a route change clears the ticket context and the selection", () => {
		commandActions.setFocusedTicket("CDE-42");
		commandActions.setSelection(["CDE-42"]);
		commandActions.setRoute("/all");
		expect(state().pathname).toBe("/all");
		expect(state().focusedTicket).toBeNull();
		expect(state().selection).toEqual([]);
		expect(contextTicket(state())).toBeNull();
	});
});
