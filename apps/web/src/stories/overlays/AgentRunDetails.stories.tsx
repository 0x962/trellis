import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentRunDetails } from "../../features/agents/AgentRunDetails";
import { failure, pending, responses, run, ticket } from "./fixtures";
import { clickButton } from "./interactions";

const assigned = {
	...run,
	kind: "agent" as const,
	terminalId: null,
	ticketId: ticket.id,
	ticketIdentifier: ticket.identifier,
	ticketTitle: ticket.title,
	projectId: ticket.project.id,
	projectKey: ticket.project.key,
};
const meta = {
	title: "Overlays/AgentRunDetails",
	component: AgentRunDetails,
	args: { run: assigned, heading: true },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"agentRuns.list": { items: [assigned], nextCursor: null },
				"agentRuns.stop": assigned,
			},
		},
	},
} satisfies Meta<typeof AgentRunDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await clickButton("Remove assignment")(context);
	await clickButton("Remove assignment")(context);
};
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Remove assignment") };
export const ReadOnly: Story = { args: { controls: false } };
export const Loading: Story = { parameters: { trellis: { responses: { "agentRuns.list": pending } } } };
export const Disabled: Story = {
	parameters: {
		trellis: {
			responses: {
				"agentRuns.list": { items: [{ ...assigned, state: "starting", processStatus: null }], nextCursor: null },
			},
		},
	},
};
export const Pending: Story = { parameters: { trellis: { responses: { "agentRuns.stop": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.stop": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
