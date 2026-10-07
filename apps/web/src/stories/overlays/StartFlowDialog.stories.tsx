import { ORPCError } from "@orpc/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { executionViewV1Example } from "@trellis/api";
import { StartFlowDialog } from "../../features/reviews/FlowRuns/components/StartFlowDialog";
import { discoveryDocuments, flowDoc, flowResponses } from "../pages/fixtures/flow";
import { pullRequest } from "../pages/fixtures/review";
import { failure, id, noop, pending } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/StartFlowDialog",
	component: StartFlowDialog,
	args: { ticket: "DEMO-1", diffId: id(90), headSha: "a".repeat(40), onClose: noop, initialFlowId: flowDoc.flow.id },
	parameters: {
		trellis: {
			responses: {
				...flowResponses,
				"pullRequests.list": [{ ...pullRequest, id: id(90), owner: "example", repo: "catalog", number: 12 }],
				"flowExecutionsV1.recovery": { state: "open" },
				"pullRequests.refresh": { url: "https://github.com/example/catalog/pull/12", fetchError: null },
				"reviews.refresh": { headSha: "a".repeat(40) },
				"flowExecutionsV1.start": executionViewV1Example,
			},
		},
	},
} satisfies Meta<typeof StartFlowDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await clickButton("Review target")(context);
	await clickButton("Start flow")(context);
};
export const Open: Story = {};
export const Selected: Story = { play: clickButton("Review target") };
export const Empty: Story = { parameters: { trellis: { responses: { "flows.list": [] } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "flows.list": pending } } } };
export const Disabled: Story = { args: { recoveryBlocked: true } };
export const AdmissionPending: Story = { args: { pendingFlowIds: [flowDoc.flow.id] } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flows.list": failure } } } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "flowExecutionsV1.start": pending } } },
	play: submit,
};
export const Success: Story = { play: submit };
export const UnknownResult: Story = {
	parameters: { trellis: { responses: { "flowExecutionsV1.start": failure } } },
	play: submit,
};
export const Repeat: Story = {
	args: { repeatReason: "Review the updated diff.", repeatOf: executionViewV1Example.id },
};
export const Unpublished: Story = { args: { initialFlowId: discoveryDocuments[1]!.flow.id } };
export const Published: Story = {
	args: { initialFlowId: discoveryDocuments[2]!.flow.id },
	play: clickButton("Review target"),
};
export const DocumentLoading: Story = { parameters: { trellis: { responses: { "flowDocumentsV1.get": pending } } } };
export const DocumentError: Story = { parameters: { trellis: { responses: { "flowDocumentsV1.get": failure } } } };
export const VersionConflict: Story = {
	parameters: {
		trellis: {
			responses: {
				"flowExecutionsV1.start": () => {
					throw new ORPCError("FLOW_VERSION_CONFLICT", { message: "The saved revision changes. Refresh the preview." });
				},
			},
		},
	},
	play: submit,
};
export const HeadConflict: Story = {
	parameters: { trellis: { responses: { "reviews.refresh": { headSha: "b".repeat(40) } } } },
	play: submit,
};
export const PreflightError: Story = {
	parameters: { trellis: { responses: { "pullRequests.refresh": failure } } },
	play: submit,
};
