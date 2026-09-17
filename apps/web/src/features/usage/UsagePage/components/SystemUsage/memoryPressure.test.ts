import { describe, expect, test } from "bun:test";
import { memoryPressureLevel } from "./memoryPressure";

describe("memoryPressureLevel", () => {
	test("maps pressure ranges to status tones", () => {
		expect(memoryPressureLevel(49.9)).toMatchObject({ label: "Normal", tone: "success" });
		expect(memoryPressureLevel(50)).toMatchObject({ label: "Elevated", tone: "warning" });
		expect(memoryPressureLevel(79.9)).toMatchObject({ label: "Elevated", tone: "warning" });
		expect(memoryPressureLevel(80)).toMatchObject({ label: "High", tone: "danger" });
	});
});
