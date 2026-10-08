import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowStepMark } from "./components/FlowStepMark";
import { FlowRunTree } from "./FlowRunTree";
import type { FlowRunRow } from "./types";

const row: FlowRunRow = {
	key: "step-accessibility-review",
	parentKey: null,
	depth: 0,
	kind: "agent",
	title: "Keyboard and zoom review",
	state: "unknown",
	meta: "Needs attention",
	detailsLabel: "Result identifiers",
	details: [
		{ label: "Step", value: "step-accessibility-review" },
		{ label: "Agent run", value: "run-01M4A0E47" },
		{ label: "Attempt", value: "attempt-01M4A0E48" },
		{ label: "Result", value: "Pending" },
	],
	startedAt: null,
	endedAt: null,
	deadlineAt: null,
	output: "Complete retained output",
	error: null,
	terminal: false,
	decidable: false,
	hasChildren: false,
};

test("renders narrow metadata and exact result identifiers", () => {
	const html = renderToStaticMarkup(
		<FlowRunTree label="History" rows={[row]} now={0} onDecide={() => {}} onOpenTerminal={() => {}} />,
	);
	expect(html).toContain("Keyboard and zoom review");
	expect(html).toContain("break-words text-xs text-fg-muted");
	expect(html).toContain("Result identifiers");
	expect(html).toContain("run-01M4A0E47");
	expect(html).toContain("attempt-01M4A0E48");
	expect(html).toContain("Complete retained output");
});

test("shows a useful state when an execution has no saved steps", () => {
	const html = renderToStaticMarkup(
		<FlowRunTree label="History" rows={[]} now={0} onDecide={() => {}} onOpenTerminal={() => {}} />,
	);
	expect(html).toContain("No execution steps");
	expect(html).toContain("no saved step activity");
});

test("keeps the status mark out of the keyboard tab order", () => {
	const html = renderToStaticMarkup(<FlowStepMark state="unknown" />);
	expect(html).not.toContain("tabindex");
	expect(html).toContain('aria-label="Needs attention"');
});
