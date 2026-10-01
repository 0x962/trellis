import type { Meta, StoryObj } from "@storybook/react-vite";
import { type FlowRunRow, type FlowRunState, FlowRunTree } from "@trellis/ui";

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
