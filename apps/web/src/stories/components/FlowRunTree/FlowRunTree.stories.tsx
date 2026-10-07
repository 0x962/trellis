import type { Meta, StoryObj } from "@storybook/react-vite";
import { type FlowRunRow, type FlowRunState, FlowRunTree } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const startedAt = Date.parse("2026-09-30T12:00:00Z");
const states: FlowRunState[] = [
	"not_started",
	"pending",
	"ready",
	"running",
	"waiting_human",
	"unknown",
	"exited",
	"succeeded",
	"skipped",
	"failed",
	"canceled",
];
const row = (key: string, state: FlowRunState): FlowRunRow => ({
	key,
	state,
	parentKey: "review",
	depth: 1,
	kind: state === "waiting_human" ? "human" : "agent",
	title: `Review step: ${state}`,
	meta: null,
	startedAt,
	endedAt: state === "running" ? null : startedAt + 60000,
	deadlineAt: null,
	output: state === "succeeded" ? "All checks pass." : null,
	error: state === "failed" ? "The check command exits with code 1." : null,
	terminal: true,
	decidable: state === "waiting_human",
	hasChildren: false,
});
const rows: FlowRunRow[] = [
	{
		...row("review", "running"),
		title: "Review",
		kind: "group",
		parentKey: null,
		depth: 0,
		hasChildren: true,
		deadlineAt: startedAt + 600000,
	},
	...states.map((state) => row(state, state)),
	{ ...row("gate", "succeeded"), kind: "gate", title: "Frontend relevant", meta: "Yes" },
	{ ...row("loop", "running"), kind: "loop", title: "Review loop", meta: "Round 2 of 5" },
];

const meta = {
	title: "Components/FlowRunTree",
	component: FlowRunTree,
	args: { label: "Review steps", rows, now: startedAt + 120000, onDecide: () => {}, onOpenTerminal: () => {} },
	parameters: {
		docs: {
			description: {
				component:
					"Expand groups and output with the pointer or keyboard. Arrow keys move between rows. Terminal and decision actions stay local.",
			},
		},
	},
	render: function Render(args) {
		const [state, setState] = useStoryState(args.state);
		return <FlowRunTree {...args} state={state} onStateChange={setState} />;
	},
} satisfies Meta<typeof FlowRunTree>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {};
export const Empty: Story = { args: { rows: [] } };
export const Collapsed: Story = {
	args: { state: { collapsed: ["review"], selectedKey: "review", outputKeys: [], scrollTop: 0, scrollLeft: 0 } },
};
export const SelectedOutput: Story = {
	args: { state: { collapsed: [], selectedKey: "succeeded", outputKeys: ["succeeded"], scrollTop: 0, scrollLeft: 0 } },
};
export const ExpandAndCollapse: Story = {
	args: Collapsed.args,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const root = await canvas.findByRole("treeitem");
		await expect(root).toHaveAttribute("aria-expanded", "false");
		await userEvent.click(root);
		await expect(root).toHaveAttribute("aria-expanded", "true");
		await expect(canvas.getByText("Review step: not_started")).toBeVisible();
		await userEvent.keyboard("{ArrowRight}");
		await expect(canvas.getByText("Review step: not_started").closest('[role="treeitem"]')).toHaveFocus();
		await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
		await expect(root).toHaveAttribute("aria-expanded", "false");
		await expect(canvas.getAllByRole("treeitem")).toHaveLength(1);
	},
};
const denseRows: FlowRunRow[] = [
	{
		...row("release", "running"),
		title: "Release readiness review for every active project and retained result",
		kind: "group",
		parentKey: null,
		depth: 0,
		hasChildren: true,
		meta: "3 steps",
	},
	{
		...row("parallel", "running"),
		title: "Review the interface at the same time",
		kind: "group",
		parentKey: "release",
		depth: 1,
		hasChildren: true,
		meta: "2 at the same time",
	},
	{
		...row("accessibility", "succeeded"),
		title: "Keyboard and zoom review",
		parentKey: "parallel",
		depth: 2,
		meta: "Supplied this output",
		output: "The 320-pixel layout preserves the complete hierarchy. ".repeat(8),
		detailsLabel: "Output provenance",
		details: [
			{ label: "Step ID", value: "step-accessibility-review" },
			{ label: "Run ID", value: "run-01M4A0E47" },
			{ label: "Attempt ID", value: "attempt-01M4A0E48" },
			{ label: "Result ID", value: "result-01M4A0E49" },
		],
	},
	{
		...row("decision", "waiting_human"),
		title: "Choose whether this reviewed result can continue",
		parentKey: "parallel",
		depth: 2,
		meta: "Needs you",
	},
];

export const DenseHierarchyNarrow: Story = {
	args: {
		rows: denseRows,
		state: {
			collapsed: [],
			selectedKey: "accessibility",
			outputKeys: ["accessibility"],
			scrollTop: 0,
			scrollLeft: 0,
		},
	},
	globals: { viewport: { value: "narrow", isRotated: false } },
};

export const OutputToggle: Story = {
	args: SelectedOutput.args,
	play: async ({ canvasElement }) => {
		const row = within(canvasElement).getByText("Review step: succeeded").closest('[role="treeitem"]')!;
		const output = within(row as HTMLElement).getByText("Output");
		await expect(output.parentElement).toHaveAttribute("open");
		await userEvent.click(output);
		await waitFor(() => expect(output.parentElement).not.toHaveAttribute("open"));
		await userEvent.click(output);
		await waitFor(() => expect(output.parentElement).toHaveAttribute("open"));
	},
};
