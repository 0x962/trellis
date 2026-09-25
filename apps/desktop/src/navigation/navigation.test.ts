import { describe, expect, mock, test } from "bun:test";
import { openSafeWebLink } from "./navigation";

describe("openSafeWebLink", () => {
	test.each(["http://example.com/terminal", "https://example.com/terminal"])(
		"sends %s to the external-open boundary once",
		(url) => {
			const open = mock(() => {});

			expect(openSafeWebLink(url, open)).toBe(true);
			expect(open).toHaveBeenCalledTimes(1);
			expect(open).toHaveBeenCalledWith(url);
		},
	);

	test("refuses an unsafe scheme", () => {
		const open = mock(() => {});

		expect(openSafeWebLink("file:///private/etc/passwd", open)).toBe(false);
		expect(open).not.toHaveBeenCalled();
	});

	test("refuses a URL with credentials", () => {
		const open = mock(() => {});

		expect(openSafeWebLink("https://person:secret@example.com/private", open)).toBe(false);
		expect(open).not.toHaveBeenCalled();
	});
});
