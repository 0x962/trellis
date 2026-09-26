import { describe, expect, test } from "bun:test";
import { commentKeySubmits } from "./commentSubmitKey";

const key = (overrides: Partial<Parameters<typeof commentKeySubmits>[0]> = {}) => ({
	key: "Enter",
	shiftKey: false,
	metaKey: false,
	ctrlKey: false,
	isComposing: false,
	...overrides,
});

describe("commentKeySubmits", () => {
	test("submits Page comments with Enter and keeps Shift+Enter for a new line", () => {
		expect(commentKeySubmits(key(), true)).toBe(true);
		expect(commentKeySubmits(key({ shiftKey: true }), true)).toBe(false);
	});

	test("does not submit during IME composition", () => {
		expect(commentKeySubmits(key({ isComposing: true }), true)).toBe(false);
	});

	test("keeps the review comment modifier shortcut", () => {
		expect(commentKeySubmits(key(), false)).toBe(false);
		expect(commentKeySubmits(key({ metaKey: true }), false)).toBe(true);
		expect(commentKeySubmits(key({ ctrlKey: true }), false)).toBe(true);
	});
});
