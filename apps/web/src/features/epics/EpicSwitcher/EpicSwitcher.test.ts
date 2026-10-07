import { describe, expect, test } from "bun:test";
import { epicSwitcherPopoverClassName } from "./EpicSwitcher";

describe("EpicSwitcher", () => {
	test("limits the popup to the width that remains in the viewport", () => {
		expect(epicSwitcherPopoverClassName).toContain("w-80");
		expect(epicSwitcherPopoverClassName).toContain("max-w-(--available-width)");
		expect(epicSwitcherPopoverClassName).toContain("p-0");
	});
});
