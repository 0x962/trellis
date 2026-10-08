import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowDecisionDialog } from "../../features/reviews/FlowRuns/components/FlowRun/components/FlowDecisionDialog";
import { decisionStepKey, flowExecution } from "../pages/fixtures/flowHistory";
import { flowHistoryJourney } from "../pages/fixtures/flowHistoryJourney";
import { failure, noop, pending } from "./fixtures";
import { clickButton } from "./interactions";

const journey = flowHistoryJourney();

const meta = {
	title: "Overlays/FlowRunActions",
	component: FlowDecisionDialog,
	args: { execution: flowExecution, actionKey: decisionStepKey, onClose: noop },
	parameters: { trellis: { responses: journey.responses } },
	beforeEach: () => journey.reset(),
} satisfies Meta<typeof FlowDecisionDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DecisionOpen: Story = {};
export const DecisionPending: Story = {
	parameters: { trellis: { responses: { "flowExecutions.decide": pending } } },
	play: clickButton("Approve step"),
};
export const DecisionError: Story = {
	parameters: { trellis: { responses: { "flowExecutions.decide": failure } } },
	play: clickButton("Approve step"),
};
export const DecisionSuccess: Story = { play: clickButton("Approve step") };
