import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRef } from "react";
import { AssignAgent } from "../../features/agents/AssignAgent";
import { DEFAULT_CHOICE } from "../../features/agents/AssignAgent/assignChoice";
import { AssignAgentDialog } from "../../features/agents/AssignAgent/components/AssignAgentDialog";
import { LaunchFields } from "../../features/agents/LaunchFields";
import { accounts, failure, harness, noop, pending, responses, run } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/Assignment",
	component: AssignAgent,
	args: { ticket: "DEMO-1", disabled: false },
	parameters: { trellis: { responses: { ...responses, "agentRuns.start": run } } },
} satisfies Meta<typeof AssignAgent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Change the harness and the model") };
export const Disabled: Story = { args: { disabled: true } };
export const Compact: Story = { args: { compact: true } };
export const Loading: Story = { parameters: { trellis: { responses: { "harnessAccounts.list": pending } } } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": pending } } },
	play: clickButton("Assign Claude"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": failure } } },
	play: clickButton("Assign Claude"),
};
export const Success: Story = { play: clickButton("Assign Claude") };
export const DialogOpen: Story = {
	render: () => (
		<AssignAgentDialog
			initial={DEFAULT_CHOICE}
			accounts={accounts}
			disabled={false}
			finalFocus={createRef()}
			onAssign={noop}
			onClose={noop}
		/>
	),
};
export const DialogSelected: Story = {
	render: () => (
		<AssignAgentDialog
			initial={{ ...DEFAULT_CHOICE, accountId: accounts[1]!.id }}
			accounts={accounts}
			disabled={false}
			finalFocus={createRef()}
			onAssign={noop}
			onClose={noop}
		/>
	),
};
export const DialogDisabled: Story = {
	render: () => (
		<AssignAgentDialog
			initial={DEFAULT_CHOICE}
			accounts={accounts}
			disabled
			finalFocus={createRef()}
			onAssign={noop}
			onClose={noop}
		/>
	),
};
export const DialogEmptyAccounts: Story = {
	render: () => (
		<AssignAgentDialog
			initial={DEFAULT_CHOICE}
			accounts={[]}
			disabled={false}
			finalFocus={createRef()}
			onAssign={noop}
			onClose={noop}
		/>
	),
};
export const LaunchControls: Story = { render: () => <LaunchFields harness={harness} onChange={noop} /> };
export const LaunchControlsDisabled: Story = {
	render: () => <LaunchFields harness={harness} onChange={noop} disabled />,
};
export const LaunchControlsDefault: Story = {
	render: () => <LaunchFields harness={null} onChange={noop} allowDefault="Use the flow harness" />,
};
