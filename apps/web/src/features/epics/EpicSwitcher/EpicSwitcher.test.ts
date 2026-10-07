import { describe, expect, test } from "bun:test";
import { epicSwitcherCommandClassName, epicSwitcherPopoverClassName } from "./EpicSwitcher";

describe("EpicSwitcher", () => {
	test("limits the popup to the width that remains in the viewport", () => {
		expect(epicSwitcherPopoverClassName).toContain("w-80");
		expect(epicSwitcherPopoverClassName).toContain("max-w-(--available-width)");
		expect(epicSwitcherPopoverClassName).toContain("p-0");
	});

	test("keeps the search field and wrapped options inside a narrow popup", () => {
		expect(epicSwitcherCommandClassName).toContain("max-sm:[&_[cmdk-input]]:min-w-0");
		expect(epicSwitcherCommandClassName).toContain("max-sm:[&_[cmdk-item]]:h-auto");
		expect(epicSwitcherCommandClassName).toContain("max-sm:[&_[cmdk-item]]:min-h-8");
		expect(epicSwitcherCommandClassName).toContain("max-sm:[&_[cmdk-item]]:py-1.5");
		expect(epicSwitcherCommandClassName).toContain("max-sm:[&_[cmdk-item]>span[aria-hidden=true]]:hidden");
	});
});
