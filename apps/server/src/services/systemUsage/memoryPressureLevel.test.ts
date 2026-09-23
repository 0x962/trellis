import { describe, expect, test } from "bun:test";
import { parseMemoryPressureLevel } from "./memoryPressureLevel.ts";

describe("parseMemoryPressureLevel", () => {
	test("reads the three levels the kernel publishes", () => {
		expect(parseMemoryPressureLevel("1\n")).toBe(1);
		expect(parseMemoryPressureLevel("2\n")).toBe(2);
		expect(parseMemoryPressureLevel("4\n")).toBe(4);
	});

	test("refuses a number that the kernel does not define", () => {
		expect(() => parseMemoryPressureLevel("3\n")).toThrow("reported 3");
	});
});
