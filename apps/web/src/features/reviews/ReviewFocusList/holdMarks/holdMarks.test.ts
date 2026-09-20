import { describe, expect, test } from "bun:test";
import { type HoldMarksStorage, isHeld, loadHoldMarks, setHoldMark } from "./holdMarks";

const memoryStorage = (): HoldMarksStorage => {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	};
};

describe("review focus hold marks", () => {
	test("keeps a held sentence for the same pull request revision", () => {
		const storage = memoryStorage();
		const sentence = "the route names no property a caller did not ask about";

		const marks = setHoldMark(storage, "0x962/trellis#162", {}, sentence, 0, "revision-1", true);

		expect(isHeld(marks, sentence, 0, "revision-1")).toBe(true);
		expect(loadHoldMarks(storage, "0x962/trellis#162")).toEqual(marks);
	});

	test("clears a held sentence for a new revision", () => {
		const storage = memoryStorage();
		const sentence = "the caller is an internal service identity";
		const marks = setHoldMark(storage, "0x962/trellis#162", {}, sentence, 0, "revision-1", true);

		expect(isHeld(marks, sentence, 0, "revision-2")).toBe(false);
	});

	test("keeps marks separate for each pull request", () => {
		const storage = memoryStorage();
		setHoldMark(storage, "0x962/trellis#162", {}, "the caller is an internal service identity", 0, "revision-1", true);

		expect(loadHoldMarks(storage, "0x962/trellis#163")).toEqual({});
	});

	test("removes a released sentence", () => {
		const storage = memoryStorage();
		const sentence = "the caller is an internal service identity";
		const marks = setHoldMark(storage, "0x962/trellis#162", {}, sentence, 0, "revision-1", true);

		expect(setHoldMark(storage, "0x962/trellis#162", marks, sentence, 0, "revision-1", false)).toEqual({});
	});

	test("keeps duplicate sentences separate", () => {
		const storage = memoryStorage();
		const sentence = "check the route";
		const marks = setHoldMark(storage, "0x962/trellis#162", {}, sentence, 0, "revision-1", true);

		expect(isHeld(marks, sentence, 0, "revision-1")).toBe(true);
		expect(isHeld(marks, sentence, 1, "revision-1")).toBe(false);
	});
});
