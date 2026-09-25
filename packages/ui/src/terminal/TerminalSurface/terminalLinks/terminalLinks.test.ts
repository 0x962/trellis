import { describe, expect, mock, test } from "bun:test";
import { terminalLinkHandler } from "./terminalLinks";

const event = {
	preventDefault: mock(() => {}),
	stopPropagation: mock(() => {}),
} as unknown as MouseEvent;

describe("terminalLinkHandler", () => {
	test.each(["http://example.com/path", "https://example.com/path?q=one#result"])(
		"opens %s in a new window once",
		(url) => {
			const open = mock(() => null);
			const activate = terminalLinkHandler(open);

			activate(event, url);

			expect(open).toHaveBeenCalledTimes(1);
			expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(event.stopPropagation).not.toHaveBeenCalled();
		},
	);

	test("does not open an unsafe scheme", () => {
		const open = mock(() => null);

		terminalLinkHandler(open)(event, "javascript:alert(1)");

		expect(open).not.toHaveBeenCalled();
	});

	test("does not open a URL with credentials", () => {
		const open = mock(() => null);

		terminalLinkHandler(open)(event, "https://person:secret@example.com/private");

		expect(open).not.toHaveBeenCalled();
	});
});
