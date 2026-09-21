import { describe, expect, test } from "bun:test";
import { type Timers, typingSaver } from "./typingSaver";

// A clock that runs the waiting callback only when the test says so.
const manualTimers = () => {
	let waiting: (() => void) | null = null;
	const timers: Timers = {
		set: (run) => {
			waiting = run;
			return 1 as unknown as ReturnType<typeof setTimeout>;
		},
		clear: () => {
			waiting = null;
		},
	};
	return { timers, elapse: () => waiting?.() };
};

describe("typingSaver", () => {
	test("saves the newest text once after the pause", () => {
		const saves: string[] = [];
		const clock = manualTimers();
		const saver = typingSaver((text) => saves.push(text), "", 600, clock.timers);

		saver.change("H");
		saver.change("Hi");
		expect(saves).toEqual([]);
		clock.elapse();
		expect(saves).toEqual(["Hi"]);
	});

	test("saves at once on flush, and sends nothing twice", () => {
		const saves: string[] = [];
		const clock = manualTimers();
		const saver = typingSaver((text) => saves.push(text), "", 600, clock.timers);

		saver.change("Hi");
		saver.flush();
		clock.elapse();
		saver.flush();
		expect(saves).toEqual(["Hi"]);
	});

	test("sends nothing when the text returns to the saved text", () => {
		const saves: string[] = [];
		const clock = manualTimers();
		const saver = typingSaver((text) => saves.push(text), "Plan", 600, clock.timers);

		saver.change("Plans");
		saver.change("Plan");
		clock.elapse();
		saver.flush();
		expect(saves).toEqual([]);
	});
});
