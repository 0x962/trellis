import { expect, test } from "bun:test";
import { rounds } from "./loopWords";

test("counts the first read as one round", () => {
	expect(rounds(0)).toBe("1 round");
});

test("counts each change a person asked for as one more round", () => {
	expect(rounds(1)).toBe("2 rounds");
	expect(rounds(3)).toBe("4 rounds");
});
