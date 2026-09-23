import { expect, test } from "bun:test";
import { closeTooltipOnEscape } from "./closeOnEscape";

const press = (target: EventTarget, key: string, answered = false) => {
	const event = new Event("keydown", { cancelable: true, bubbles: true });
	Object.defineProperty(event, "key", { value: key });
	// A key press that another handler answered carries defaultPrevented.
	if (answered) event.preventDefault();
	target.dispatchEvent(event);
	return event;
};

test("closes the tooltip on Escape and leaves the key press for the dialog under it", () => {
	const target = new EventTarget();
	let closed = 0;
	closeTooltipOnEscape(target, () => {
		closed += 1;
	});

	const event = press(target, "Escape");

	expect(closed).toBe(1);
	expect(event.defaultPrevented).toBe(false);
});

test("keeps the tooltip open on every other key", () => {
	const target = new EventTarget();
	let closed = 0;
	closeTooltipOnEscape(target, () => {
		closed += 1;
	});

	press(target, "Enter");
	press(target, "a");

	expect(closed).toBe(0);
});

test("keeps the tooltip open on an Escape that another handler already answered", () => {
	const target = new EventTarget();
	let closed = 0;
	closeTooltipOnEscape(target, () => {
		closed += 1;
	});

	press(target, "Escape", true);

	expect(closed).toBe(0);
});

test("stops listening after the cleanup", () => {
	const target = new EventTarget();
	let closed = 0;
	const stop = closeTooltipOnEscape(target, () => {
		closed += 1;
	});

	stop();
	press(target, "Escape");

	expect(closed).toBe(0);
});
