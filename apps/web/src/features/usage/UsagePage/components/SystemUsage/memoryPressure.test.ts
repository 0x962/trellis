import { describe, expect, test } from "bun:test";
import { memoryPressureLevel } from "./memoryPressure";

describe("memoryPressureLevel", () => {
	test("names each level that the kernel publishes", () => {
		expect(memoryPressureLevel(1)).toEqual({
			label: "Normal",
			tone: "faint",
			textClass: "text-fg-faint",
			valueClass: "text-fg",
		});
		expect(memoryPressureLevel(2)).toEqual({
			label: "Warning",
			tone: "warning",
			textClass: "text-warning",
			valueClass: "text-warning",
		});
		expect(memoryPressureLevel(4)).toEqual({
			label: "Critical",
			tone: "danger",
			textClass: "text-danger",
			valueClass: "text-danger",
		});
	});

	test("says a level is unavailable rather than calling it normal", () => {
		expect(memoryPressureLevel(null)).toEqual({
			label: "Unavailable",
			tone: "danger",
			textClass: "text-danger",
			valueClass: "text-danger",
		});
	});

	test("says an unrecognized level is unknown", () => {
		expect(memoryPressureLevel(3)).toEqual({
			label: "Unknown",
			tone: "accent",
			textClass: "text-accent",
			valueClass: "text-accent",
		});
	});
});
