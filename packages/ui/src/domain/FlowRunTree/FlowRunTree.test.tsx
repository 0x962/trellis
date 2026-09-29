import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowRunTree } from "./FlowRunTree";
import type { FlowRunRow } from "./types";

const row: FlowRunRow = {
	key: "round-51",
	parentKey: null,
	depth: 0,
	kind: null,
	title: "Historical component",
	state: "unknown",
	meta: "Round 51 · Output source unknown",
	startedAt: null,
	endedAt: null,
	deadlineAt: null,
	output: "Complete retained output",
	error: null,
	terminal: false,
	decidable: false,
	hasChildren: false,
};

test("renders unknown kinds and metadata at narrow widths", () => {
	const html = renderToStaticMarkup(
		<FlowRunTree label="History" rows={[row]} now={0} onDecide={() => {}} onOpenTerminal={() => {}} />,
	);
	expect(html).toContain("Historical component");
	expect(html).toContain("break-words text-xs text-fg-muted");
	expect(html).toContain("Round 51");
	expect(html).toContain("Complete retained output");
});

test("restores selected and expanded output state from its caller", () => {
	const html = renderToStaticMarkup(
		<FlowRunTree
			label="History"
			rows={[row]}
			now={0}
			onDecide={() => {}}
			onOpenTerminal={() => {}}
			state={{ collapsed: [], selectedKey: row.key, outputKeys: [row.key], scrollTop: 200, scrollLeft: 0 }}
		/>,
	);
	expect(html).toContain('aria-selected="true"');
	expect(html).toContain('open=""');
});
