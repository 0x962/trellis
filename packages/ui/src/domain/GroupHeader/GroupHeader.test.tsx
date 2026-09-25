import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupHeader } from "./GroupHeader";

const markup = (props: Partial<Parameters<typeof GroupHeader>[0]>) =>
	renderToStaticMarkup(
		<GroupHeader group="wave-1" label="Marks, motion, the first facts" expanded onToggle={() => {}} {...props} />,
	);

describe("GroupHeader icon", () => {
	test("draws the icon before the label", () => {
		const html = markup({ icon: <span data-wave-progress="">wave progress</span> });

		expect(html.indexOf("data-wave-progress")).toBeGreaterThan(-1);
		expect(html.indexOf("data-wave-progress")).toBeLessThan(html.indexOf("Marks, motion, the first facts"));
	});

	test("draws no trailing done mark", () => {
		expect(markup({})).not.toContain("data-done-mark");
	});

	test("keeps the label in the toggle button", () => {
		expect(markup({ icon: <span data-wave-progress="">wave progress</span> })).toContain(
			"Marks, motion, the first facts",
		);
	});
});

describe("GroupHeader appearance", () => {
	test("the inset box holds a side margin, a rounded border and its own background", () => {
		const html = markup({});

		expect(html).toContain("mx-3");
		expect(html).toContain("rounded-sm");
		expect(html).toContain("border-border");
		expect(html).toContain("bg-band");
	});

	test("the inset box takes no full width, so its side margin holds", () => {
		expect(markup({})).not.toContain("w-full");
	});

	test("a sticky inset box stops below its optional gap", () => {
		expect(markup({ appearance: "inset", insetGap: true, sticky: true })).toContain("sticky top-1");
		expect(markup({ appearance: "inset", sticky: true })).toContain("sticky top-0");
	});

	test("the band keeps the full width and the line above and below", () => {
		const html = markup({ appearance: "band" });

		expect(html).toContain("w-full");
		expect(html).toContain("border-y");
		expect(html).toContain("bg-band");
		expect(html).not.toContain("rounded-sm");
	});

	test("a sticky band stops at the top of its list", () => {
		expect(markup({ appearance: "band", sticky: true })).toContain("sticky top-0");
	});

	test("a virtual inset box stays inside the header slot", () => {
		const html = markup({ layout: "grid", top: 64 });

		expect(html).toContain("absolute inset-x-0 top-0");
		expect(html).not.toContain("my-1");
		expect(html).toContain("translateY(64px)");
	});

	test("the sidebar box draws no border", () => {
		const html = markup({ appearance: "sidebar" });

		expect(html).toContain("bg-bg");
		expect(html).not.toContain("border-border");
	});

	test("a collapsed inset group offers Show", () => {
		expect(markup({ appearance: "inset", expanded: false, count: 3 })).toContain("Show ");
	});

	test("a collapsed sidebar group offers no Show", () => {
		expect(markup({ appearance: "sidebar", expanded: false, count: 3 })).not.toContain("Show ");
	});
});
