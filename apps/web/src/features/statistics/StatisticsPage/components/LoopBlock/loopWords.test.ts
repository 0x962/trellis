import { expect, test } from "bun:test";
import { readyToVerdict, rounds } from "./loopWords";

test("counts the first read as one round", () => {
	expect(rounds(0)).toBe("1 round");
});

test("counts each change a person asked for as one more round", () => {
	expect(rounds(1)).toBe("2 rounds");
	expect(rounds(3)).toBe("4 rounds");
});

test("prints the median wait with the count it covers", () => {
	expect(readyToVerdict({ merged: 30, readyToVerdictMs: 7_200_000, readyToVerdictMeasured: 18 })).toEqual({
		value: "2h median.",
		note: "Over the 18 of 30 that carry both the ready stamp and a verdict from you.",
	});
});

test("prints the count alone while fewer than half of the window carries both moments", () => {
	expect(readyToVerdict({ merged: 30, readyToVerdictMs: 7_200_000, readyToVerdictMeasured: 14 })).toEqual({
		value: "Not printed.",
		note: "Only 14 of 30 carry both the ready stamp and a verdict from you.",
	});
});

test("says that the window measures nothing while no row carries both moments", () => {
	expect(readyToVerdict({ merged: 30, readyToVerdictMs: null, readyToVerdictMeasured: 0 }).value).toBe("Not measured.");
});
