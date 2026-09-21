import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { epicState } from "./epicState";

const row = (epic: string | null, wave: string | null): TicketSummary =>
	({
		epic: epic === null ? null : { id: epic, ref: epic, name: epic },
		wave: wave === null ? null : { id: wave, ref: wave, name: wave },
	}) as unknown as TicketSummary;

describe("epicState", () => {
	test("tickets of one epic and one wave share both refs", () => {
		expect(epicState([row("OP/a", "OP/a/m1"), row("OP/a", "OP/a/m1")])).toEqual({
			epicRef: "OP/a",
			epicMixed: false,
			waveRef: "OP/a/m1",
			waveMixed: false,
		});
	});

	test("a ticket with no wave makes the waves mixed", () => {
		expect(epicState([row("OP/a", "OP/a/m1"), row("OP/a", null)])).toEqual({
			epicRef: "OP/a",
			epicMixed: false,
			waveRef: undefined,
			waveMixed: true,
		});
	});

	test("tickets of two epics share no epic", () => {
		const state = epicState([row("OP/a", null), row("OP/b", null)]);
		expect(state.epicRef).toBeUndefined();
		expect(state.epicMixed).toBe(true);
	});

	test("a ticket with no epic makes the epics mixed", () => {
		const state = epicState([row("OP/a", null), row(null, null)]);
		expect(state.epicRef).toBeUndefined();
		expect(state.epicMixed).toBe(true);
	});

	test("tickets with no epic share no epic and are not mixed", () => {
		expect(epicState([row(null, null), row(null, null)])).toEqual({
			epicRef: undefined,
			epicMixed: false,
			waveRef: undefined,
			waveMixed: false,
		});
	});
});
