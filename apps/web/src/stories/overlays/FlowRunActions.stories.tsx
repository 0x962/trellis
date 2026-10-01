import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	executionViewV1Example,
	occurrenceV1Example,
	retainedOutputV1Example,
	stopPendingV1Example,
	unknownDecisionV1Example,
} from "@trellis/api";
import { FlowCancelDialog } from "../../features/reviews/FlowRuns/components/FlowRun/components/FlowCancelDialog";
import { FlowDecisionDialog } from "../../features/reviews/FlowRuns/components/FlowRun/components/FlowDecisionDialog";
import { at, failure, noop, pending, responses } from "./fixtures";
import { clickButton } from "./interactions";

const waiting = {
	...executionViewV1Example,
	status: "waiting" as const,
	occurrences: [
		{
			...occurrenceV1Example,
			kind: "human" as const,
			state: "waiting_human" as const,
			waitReason: "human" as const,
			title: "Approve the catalog",
			instruction: "Review the catalog in both themes.",
		},
		retainedOutputV1Example,
	],
};
const meta = {
	title: "Overlays/FlowRunActions",
	component: FlowCancelDialog,
	args: { execution: executionViewV1Example, onClose: noop },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"flowExecutionsV1.recovery": { state: "open" },
				"flowExecutionsV1.cancel": { ...executionViewV1Example, revision: 9, status: "canceled" },
				"flowExecutionsV1.decision": {
					...waiting,
					revision: 9,
					decisionDeliveries: [
						{
							...unknownDecisionV1Example,
							state: "confirmed",
							acceptedReceiptId: "storybook-decision-receipt",
							confirmedAt: at,
						},
					],
				},
			},
		},
	},
} satisfies Meta<typeof FlowCancelDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CancelOpen: Story = {};
export const CancelDisabled: Story = { args: { recoveryBlocked: true } };
export const CancelPending: Story = {
	parameters: { trellis: { responses: { "flowExecutionsV1.cancel": pending } } },
	play: clickButton("Cancel run"),
};
export const CancelError: Story = {
	parameters: { trellis: { responses: { "flowExecutionsV1.cancel": failure } } },
	play: clickButton("Cancel run"),
};
export const CancelSuccess: Story = { play: clickButton("Cancel run") };
export const StopPending: Story = { args: { execution: stopPendingV1Example } };
export const DecisionOpen: Story = {
	render: () => <FlowDecisionDialog execution={waiting} actionKey="review-37" onClose={noop} />,
};
export const DecisionEmpty: Story = {
	render: () => <FlowDecisionDialog execution={executionViewV1Example} actionKey="unknown" onClose={noop} />,
};
export const DecisionDisabled: Story = {
	render: () => <FlowDecisionDialog execution={waiting} actionKey="review-37" onClose={noop} recoveryBlocked />,
};
export const DecisionPending: Story = {
	...DecisionOpen,
	parameters: { trellis: { responses: { "flowExecutionsV1.decision": pending } } },
	play: clickButton("Approve step"),
};
export const DecisionError: Story = {
	...DecisionOpen,
	parameters: { trellis: { responses: { "flowExecutionsV1.decision": failure } } },
	play: clickButton("Approve step"),
};
export const DecisionSuccess: Story = { ...DecisionOpen, play: clickButton("Approve step") };
export const DecisionUnknown: Story = {
	render: () => (
		<FlowDecisionDialog
			execution={{ ...waiting, decisionDeliveries: [unknownDecisionV1Example] }}
			actionKey="review-37"
			onClose={noop}
		/>
	),
};
