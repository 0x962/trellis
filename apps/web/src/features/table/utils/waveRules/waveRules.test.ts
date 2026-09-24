import { describe, expect, test } from "bun:test";
import type { TicketSummary, WaveSummary } from "@trellis/api";
import { deleteWords, movedRefs } from "./waveRules";

const wave = (id: string, name = id, total = 0, state: "open" | "done" = "open") =>
	({ id, ref: `OP/epic/${id}`, name, state, counts: { total, done: 0, canceled: 0 } }) as WaveSummary;
const ticket = (id: string, waveId: string | null) =>
	({ id, wave: waveId === null ? null : { id: waveId, ref: `OP/epic/${waveId}`, name: waveId } }) as TicketSummary;

describe("movedRefs", () => {
	const waves = [wave("a"), wave("b"), wave("c")];

	test("moves a wave one place up or down", () => {
		expect(movedRefs(waves, "b", -1)).toEqual(["OP/epic/b", "OP/epic/a", "OP/epic/c"]);
		expect(movedRefs(waves, "b", 1)).toEqual(["OP/epic/a", "OP/epic/c", "OP/epic/b"]);
	});

	test("does not move the first wave up or the last wave down", () => {
		expect(movedRefs(waves, "a", -1)).toBeNull();
		expect(movedRefs(waves, "c", 1)).toBeNull();
	});

	test("moves inside the displayed state section and keeps other positions", () => {
		const mixed = [wave("a"), wave("done", "done", 0, "done"), wave("b")];

		expect(movedRefs(mixed, "a", 1)).toEqual(["OP/epic/b", "OP/epic/done", "OP/epic/a"]);
		expect(movedRefs(mixed, "b", -1)).toEqual(["OP/epic/b", "OP/epic/done", "OP/epic/a"]);
		expect(movedRefs(mixed, "b", 1)).toBeNull();
		expect(movedRefs(mixed, "done", -1)).toBeNull();
	});
});

describe("deleteWords", () => {
	const members = [ticket("t1", "a"), ticket("t2", "a"), ticket("t3", "b")];

	test("names the tickets that leave the wave", () => {
		expect(deleteWords(wave("a", "a", 2), members, new Set())).toBe(
			"The 2 tickets of the wave stay in the epic and move to No wave.",
		);
	});

	test("names the open agent runs of the wave, and says a delete stops none", () => {
		expect(deleteWords(wave("a", "a", 2), members, new Set(["t1", "t3"]))).toBe(
			"The 2 tickets of the wave stay in the epic and move to No wave. 1 of them has an open agent run. A delete stops no agent.",
		);
	});
});
