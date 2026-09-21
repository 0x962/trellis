import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupHeader } from "./GroupHeader";

const markup = (props: Partial<Parameters<typeof GroupHeader>[0]>) =>
	renderToStaticMarkup(
		<GroupHeader group="wave-1" label="Marks, motion, the first facts" expanded onToggle={() => {}} {...props} />,
	);

describe("GroupHeader done mark", () => {
	test("draws the double check in the success color when the group is done", () => {
		const html = markup({ done: true });

		expect(html).toContain("data-done-mark");
		expect(html).toContain("text-success");
	});

	test("draws no mark while the group holds an open ticket", () => {
		expect(markup({ done: false })).not.toContain("data-done-mark");
		expect(markup({})).not.toContain("data-done-mark");
	});

	test("keeps the label out of the mark, so the name reads the same either way", () => {
		expect(markup({ done: true })).toContain("Marks, motion, the first facts");
	});
});
