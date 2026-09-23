import { describe, expect, test } from "bun:test";
import { memoryPressureLevel } from "./memoryPressure";

describe("memoryPressureLevel", () => {
	test("names each level that the kernel publishes", () => {
		expect(memoryPressureLevel(1)).toMatchObject({ label: "Normal", tone: "faint" });
		expect(memoryPressureLevel(2)).toMatchObject({ label: "Warning", tone: "faint" });
		expect(memoryPressureLevel(4)).toMatchObject({ label: "Critical", tone: "danger" });
	});

	test("says a level is unavailable rather than calling it normal", () => {
		expect(memoryPressureLevel(null)).toMatchObject({ label: "Unavailable", tone: "faint" });
	});
});
