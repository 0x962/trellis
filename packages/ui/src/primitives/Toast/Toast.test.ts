import { expect, mock, test } from "bun:test";
import { consumeExpandedToastEscape } from "./Toast";

type ToastKeyDownEvent = Parameters<typeof consumeExpandedToastEscape>[0];

const escapeEvent = (expanded: boolean, preventDefault: () => void): ToastKeyDownEvent =>
	({
		key: "Escape",
		currentTarget: {
			querySelector: () => (expanded ? {} : null),
		},
		preventDefault,
	}) as unknown as ToastKeyDownEvent;

test("an expanded toast consumes Escape before ticket navigation", () => {
	const preventDefault = mock(() => {});
	consumeExpandedToastEscape(escapeEvent(true, preventDefault));
	expect(preventDefault).toHaveBeenCalledTimes(1);

	preventDefault.mockClear();
	consumeExpandedToastEscape(escapeEvent(false, preventDefault));
	expect(preventDefault).not.toHaveBeenCalled();
});
