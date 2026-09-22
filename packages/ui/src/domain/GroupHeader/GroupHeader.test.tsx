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
