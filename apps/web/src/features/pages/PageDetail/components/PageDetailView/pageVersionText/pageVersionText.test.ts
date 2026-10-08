import { describe, expect, test } from "bun:test";
import { pageHistoryLabel, pageShareLabel, pageVersionStatus } from "./pageVersionText";

describe("pageVersionText", () => {
	test("names the viewed version position and state", () => {
		expect(pageVersionStatus(2, 2, false)).toBe("Version 2 of 2, current");
		expect(pageVersionStatus(1, 2, true)).toBe("Version 1 of 2, read-only");
	});

	test("names the viewed position in the history action", () => {
		expect(pageHistoryLabel(1, 2)).toBe("Version history, viewing version 1 of 2");
	});

	test("names the current-version destination from a historical Page", () => {
		expect(pageShareLabel(false)).toBe("Share Page");
		expect(pageShareLabel(true)).toBe("Share Page, link opens the current version");
	});
});
