import { afterEach, expect, test } from "bun:test";
import type { Ticket } from "@trellis/api";
import { composerActions, useComposerStore } from "./composerStore";

afterEach(() => composerActions.close());
const ticket = { id: "ticket", identifier: "TRL-1" } as Ticket;

test("one opening reports its first ticket once", () => {
	const created: Ticket[] = [];
	composerActions.open({ onCreated: (value) => created.push(value) });
	const { openingId } = useComposerStore.getState();
	composerActions.created(openingId, ticket);
	composerActions.created(openingId, ticket);
	expect(created).toEqual([ticket]);
});

test("close and route dismissal discard the ticket callback", () => {
	const created: Ticket[] = [];
	composerActions.open({ onCreated: (value) => created.push(value) });
	const first = useComposerStore.getState().openingId;
	composerActions.close();
	composerActions.created(first, ticket);
	composerActions.open({ onCreated: (value) => created.push(value) });
	const second = useComposerStore.getState().openingId;
	composerActions.clearOnCreated();
	composerActions.created(second, ticket);
	expect(created).toEqual([]);
});

test("a replaced opening cannot consume the new opening's callback", () => {
	const first: Ticket[] = [];
	const second: Ticket[] = [];
	composerActions.open({ onCreated: (value) => first.push(value) });
	const previous = useComposerStore.getState().openingId;
	composerActions.open({ onCreated: (value) => second.push(value) });
	const current = useComposerStore.getState().openingId;
	composerActions.created(previous, ticket);
	composerActions.created(current, ticket);
	expect(first).toEqual([]);
	expect(second).toEqual([ticket]);
});
