import { ORPCError } from "@orpc/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StartFlowDialog } from "../../features/reviews/FlowRuns/components/StartFlowDialog";
import { flowResponses } from "../pages/fixtures/flow";
import { flowExecution } from "../pages/fixtures/flowHistory";
import { failure, id, noop, pending } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/StartFlowDialog",
	component: StartFlowDialog,
	args: { ticket: "DEMO-1", diffId: id(90), headSha: "a".repeat(40), onClose: noop },
	parameters: {
		trellis: {
			responses: {
				...flowResponses,
				"flowExecutions.start": flowExecution,
			},
		},
	},
} satisfies Meta<typeof StartFlowDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = clickButton("Start flow");
export const Open: Story = {};
export const Empty: Story = { parameters: { trellis: { responses: { "flows.list": [] } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "flows.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flows.list": failure } } } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "flowExecutions.start": pending } } },
	play: submit,
};
export const Success: Story = { play: submit };
export const StartError: Story = {
	parameters: { trellis: { responses: { "flowExecutions.start": failure } } },
	play: submit,
};
export const VersionConflict: Story = {
	parameters: {
		trellis: {
			responses: {
				"flowExecutions.start": () => {
					throw new ORPCError("FLOW_VERSION_CONFLICT", {
						message: "The saved version changed. Open the dialog again.",
					});
				},
			},
		},
	},
	play: submit,
};
