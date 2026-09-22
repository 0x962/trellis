import { expect, test } from "bun:test";
import { isCopyLinkChord } from "./copyLinkChord.ts";

const press = { type: "keyDown", key: "C", shift: true, meta: true, control: false, alt: false };

test("matches Command+Shift+C and Control+Shift+C on key down", () => {
	expect(isCopyLinkChord(press)).toBe(true);
	expect(isCopyLinkChord({ ...press, meta: false, control: true })).toBe(true);
});

test("ignores Command+C, Option in the chord, and the key release", () => {
	expect(isCopyLinkChord({ ...press, shift: false, key: "c" })).toBe(false);
	expect(isCopyLinkChord({ ...press, alt: true })).toBe(false);
	expect(isCopyLinkChord({ ...press, type: "keyUp" })).toBe(false);
});
