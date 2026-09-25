import { describe, expect, mock, test } from "bun:test";
import { openExternalUrl } from "./navigation";

describe("openExternalUrl", () => {
	test.each(["http://example.com/terminal", "https://example.com/terminal"])(
		"sends %s to the external-open boundary once",
		(url) => {
			const open = mock(() => {});

			expect(openExternalUrl(url, open)).toBe(true);
			expect(open).toHaveBeenCalledTimes(1);
			expect(open).toHaveBeenCalledWith(url);
		},
	);

	test("refuses an unsafe scheme", () => {
		const open = mock(() => {});

		expect(openExternalUrl("file:///private/etc/passwd", open)).toBe(false);
		expect(open).not.toHaveBeenCalled();
	});

	test("refuses a URL with credentials", () => {
		const open = mock(() => {});

		expect(openExternalUrl("https://person:secret@example.com/private", open)).toBe(false);
		expect(open).not.toHaveBeenCalled();
	});
});
