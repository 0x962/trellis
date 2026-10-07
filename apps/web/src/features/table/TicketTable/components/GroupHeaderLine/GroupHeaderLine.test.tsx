import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TableGroup } from "../../../utils/flattenGroups";
import { GroupHeaderLine } from "./GroupHeaderLine";

const group = {
	key: "wave-1",
	label: "Foundation",
	rows: [],
	count: 0,
	countLabel: "Current \u00b7 0/0",
	completedCount: 0,
	totalCount: 0,
	done: false,
	expanded: true,
} as TableGroup;

const render = (waveSection: boolean, box?: { top: number; height: number }) =>
	renderToStaticMarkup(
		<GroupHeaderLine
			group={group}
			top={40}
			box={box}
			phone={false}
			filling={false}
			waveSection={waveSection}
			onToggleGroup={() => {}}
			onCreateInGroup={() => {}}
		/>,
	);

test("a wave section exposes a grid row and cell around a section header", () => {
	const html = render(true);

	expect(html).toContain('role="row"');
	expect(html).toContain('role="gridcell"');
	expect(html).not.toContain('role="rowgroup"');
	expect(html).toContain("Current \u00b7 0/0");
	expect(html).toContain("translateY(40px)");
});

test("a sticky wave section keeps the semantic row on its wave box", () => {
	const html = render(true, { top: 72, height: 184 });

	expect(html).toContain('role="row"');
	expect(html).toContain('role="gridcell"');
	expect(html).toContain('data-wave-box="wave-1"');
	expect(html).toContain("top:72px");
	expect(html).toContain("height:184px");
});

test("a non-wave group keeps the existing rowgroup output", () => {
	const html = render(false);

	expect(html).toContain('role="rowgroup"');
	expect(html).not.toContain('role="row"');
	expect(html).not.toContain('role="gridcell"');
});
