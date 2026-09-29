import { expect, test } from "bun:test";
import { linkPress } from "./linkPress";

test("copies press fields without event methods or later event changes", () => {
	const event = { metaKey: true, ctrlKey: false, shiftKey: true, altKey: false, button: 1, preventDefault() {} };
	const press = linkPress(event);
	event.metaKey = false;
	expect(press).toEqual({ metaKey: true, ctrlKey: false, shiftKey: true, altKey: false, button: 1 });
	expect(Object.keys(press)).toHaveLength(5);
	expect(press).not.toBe(event);
});
