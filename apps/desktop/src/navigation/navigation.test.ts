import { describe, expect, mock, test } from "bun:test";
import { deepLinkPath, openSafeWebLink } from "./navigation";

const id = "01M3D3SJM6ZCR31JSN793PR52J";

describe("deepLinkPath", () => {
	for (const type of ["page", "pr", "ticket", "resource", "epic", "session"]) {
		test(`sends a ${type} record link to the internal resolver`, () => {
			const link = `trellis://${type}/${id}`;
			expect(deepLinkPath(link)).toBe(`/search?internalLink=${encodeURIComponent(link)}`);
		});
	}

	test("keeps the route form that desktop notifications use", () => {
		expect(deepLinkPath("trellis://open/t/TRL-480#activity")).toBe("/t/TRL-480#activity");
	});

	test.each([
		`trellis://unknown/${id}`,
		"trellis://page/not-an-id",
		`trellis://page/${id}?version=2`,
		`trellis://page/${id}/extra`,
	])("refuses %s", (link) => {
		expect(deepLinkPath(link)).toBeNull();
	});
});

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
