import { describe, expect, test } from "bun:test";
import type { WaveSummary } from "@trellis/api";
import { nextWaveName } from "./nextWaveName";

const wave = (id: string, name: string) => ({ id, name }) as WaveSummary;

describe("nextWaveName", () => {
	test("numbers the first wave 1 and the next one after the count", () => {
		expect(nextWaveName([])).toBe("Wave 1");
		expect(nextWaveName([wave("a", "Plan")])).toBe("Wave 2");
	});

	test("skips a number that a wave name holds", () => {
		expect(nextWaveName([wave("a", "Wave 2"), wave("b", "Wave 3")])).toBe("Wave 4");
	});
});
