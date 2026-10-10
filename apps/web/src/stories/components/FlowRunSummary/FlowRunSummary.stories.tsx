import { DotsThree, X } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowRunSummary, IconButton } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/FlowRunSummary",
	component: FlowRunSummary,
	args: {
		name: "Review",
		version: 3,
		status: "running",
		startedAt: Date.parse("2026-09-30T12:00:00Z"),
		startedLabel: "2m ago",
		durationMs: 120000,
		notice: "The code review runs.",
		expanded: true,
		onToggle: () => {},
	},
	render: function Render(args) {
		const [expanded, setExpanded] = useStoryState(args.expanded);
		return <FlowRunSummary {...args} expanded={expanded} onToggle={() => setExpanded(!expanded)} />;
	},
} satisfies Meta<typeof FlowRunSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Waiting: Story = { args: { status: "waiting", notice: "Approve the plan." } };
export const Succeeded: Story = { args: { status: "succeeded", notice: null } };
export const Failed: Story = { args: { status: "failed", notice: "The code review failed." } };
export const Canceled: Story = { args: { status: "canceled", notice: "The user cancels the run." } };
export const Collapsed: Story = { args: { expanded: false } };
export const LongName: Story = { args: { name: "Review the current release across every configured project" } };
export const LongNameNarrowWithActions: Story = {
	args: {
		name: "Review the current release across every configured project and retained workspace result",
		actions: (
			<>
				<IconButton label="Run actions" icon={<DotsThree />} />
				<IconButton label="Cancel run" icon={<X />} />
			</>
		),
	},
	globals: { viewport: { value: "narrow", isRotated: false } },
};
