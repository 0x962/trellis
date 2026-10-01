import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { BroadcastDialog } from "../../features/agents/BroadcastDialog/BroadcastDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { epic, failure, noop, pending, responses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const delivery = { recipientCount: 2, acceptedCount: 2, failures: [] };
const meta = {
	title: "Overlays/BroadcastDialog",
	component: BroadcastDialog,
	args: { onClose: noop },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"agentRuns.broadcastRecipients": { working: 2, idle: 1 },
				"agentRuns.broadcast": delivery,
			},
		},
	},
	render: (args, context) => (
		<OverlayTrigger label="Broadcast" initiallyOpen={!context.parameters.closed}>
			{(close) => <BroadcastDialog {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof BroadcastDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Message", "Please review the current wave.");
	await clickButton("Send to 2 agents")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const EpicScope: Story = { args: { epic } };
export const Empty: Story = {
	parameters: { trellis: { responses: { "agentRuns.broadcastRecipients": { working: 0, idle: 0 } } } },
};
export const Loading: Story = { parameters: { trellis: { responses: { "agentRuns.broadcastRecipients": pending } } } };
export const CountsError: Story = {
	parameters: { trellis: { responses: { "agentRuns.broadcastRecipients": failure } } },
};
export const Disabled: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(
			await within(canvasElement.ownerDocument.body).findByRole("checkbox", { name: "Working agents (2)" }),
		);
	},
};
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		await fillField(canvasElement, "Message", "Please review the current wave.");
		await userEvent.click(
			await within(canvasElement.ownerDocument.body).findByRole("checkbox", { name: "Idle agents (1)" }),
		);
	},
};
export const Pending: Story = {
	parameters: { trellis: { responses: { "agentRuns.broadcast": pending } } },
	play: submit,
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.broadcast": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
export const PartialSuccess: Story = {
	parameters: {
		trellis: {
			responses: {
				"agentRuns.broadcast": {
					...delivery,
					acceptedCount: 1,
					failures: [
						{
							recipient: { id: "local-agent", name: "Catalog agent", ticketIdentifier: "DEMO-2" },
							reason: "The agent is stopped.",
						},
					],
				},
			},
		},
	},
	play: submit,
};
