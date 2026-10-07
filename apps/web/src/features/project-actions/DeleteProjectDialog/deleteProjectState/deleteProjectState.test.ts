import { expect, test } from "bun:test";
import { deleteProjectState } from "./deleteProjectState";

const state = (
	overrides: Partial<Parameters<typeof deleteProjectState>[0]> = {},
): ReturnType<typeof deleteProjectState> =>
	deleteProjectState({
		projectKey: "DEMO",
		ticketCount: 0,
		flowCount: 0,
		typedKey: "",
		loading: false,
		failed: false,
		pending: false,
		...overrides,
	});

test("delete waits until the ticket and flow reads finish", () => {
	expect(state({ ticketCount: 4, flowCount: undefined }).ready).toBe(false);
	expect(state({ ticketCount: 4, flowCount: 2, loading: true }).ready).toBe(false);
	expect(state({ ticketCount: 4, flowCount: 2, failed: true }).ready).toBe(false);
});

test("tickets or flows require the exact project key", () => {
	expect(state({ ticketCount: 1 }).needsKey).toBe(true);
	expect(state({ flowCount: 1 }).needsKey).toBe(true);
	expect(state({ ticketCount: 1, typedKey: "demo" }).ready).toBe(false);
	expect(state({ flowCount: 1, typedKey: "DEMO" }).ready).toBe(true);
	expect(state({ ticketCount: 1, typedKey: "DEMO " }).ready).toBe(false);
});

test("an empty project needs no typed key", () => {
	expect(state()).toMatchObject({ loaded: true, needsKey: false, ready: true });
	expect(state({ pending: true }).ready).toBe(false);
});

test("the delete copy names every removed record type", () => {
	const description = state({ ticketCount: 2, flowCount: 3 }).description;

	for (const text of ["DEMO", "2 tickets", "ticket attachments", "resources", "Pages", "3 flows", "every step"]) {
		expect(description).toContain(text);
	}
	expect(description).toContain("You cannot undo this.");
});

test("the delete copy uses singular ticket and flow names", () => {
	expect(state({ ticketCount: 1, flowCount: 1 }).description).toContain("1 ticket");
	expect(state({ ticketCount: 1, flowCount: 1 }).description).toContain("1 flow");
});
