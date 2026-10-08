import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { TicketAgent } from "../../features/agents/TicketAgent";
import { AttachmentActions } from "../../features/attachments/AttachmentGrid/components/AttachmentActions";
import { ConflictNotice } from "../../features/ticket/components/ConflictNotice";
import { MoreMenu } from "../../features/ticket/Header/components/MoreMenu";
import { actor, at, failure, id, noop, pending, responses, run, ticket } from "./fixtures";
import { clickButton } from "./interactions";

const attachment = {
	id: id(92),
	ticketId: ticket.id,
	filename: "catalog.txt",
	mime: "text/plain",
	size: 512,
	sha256: "a".repeat(64),
	actor,
	createdAt: at,
	url: "data:text/plain,Storybook%20catalog",
};
const assignedRun = {
	...run,
	kind: "agent" as const,
	ticketId: ticket.id,
	ticketIdentifier: ticket.identifier,
	ticketTitle: ticket.title,
	ticketStatusCategory: "todo" as const,
};
const meta = {
	title: "Overlays/TicketActions",
	component: MoreMenu,
	args: { ticket },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"tickets.delete": {},
				"agentRuns.stop": assignedRun,
				"agentRuns.list": { items: [assignedRun], nextCursor: null },
			},
		},
	},
} satisfies Meta<typeof MoreMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("More actions") };
export const DeleteConfirmation: Story = {
	play: async (context) => {
		await clickButton("More actions")(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Delete" }),
		);
	},
};
export const Conflict: Story = { render: () => <ConflictNotice current={ticket} onOverwrite={noop} onClose={noop} /> };
export const ConflictConfirmation: Story = { ...Conflict, play: clickButton("Keep mine") };
export const AttachmentClosed: Story = {
	render: () => <AttachmentActions attachment={attachment} onDelete={async () => {}} onRename={noop} />,
};
export const AttachmentOpen: Story = { ...AttachmentClosed, play: clickButton("Actions for catalog.txt") };
export const AttachmentDelete: Story = {
	...AttachmentClosed,
	play: async (context) => {
		await clickButton("Actions for catalog.txt")(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Delete" }),
		);
	},
};
export const AgentAssigned: Story = { render: () => <TicketAgent ticket={ticket.identifier} /> };
export const AgentEmpty: Story = {
	...AgentAssigned,
	parameters: { trellis: { responses: { "agentRuns.list": { items: [], nextCursor: null } } } },
};
export const AgentLoading: Story = {
	...AgentAssigned,
	parameters: { trellis: { responses: { "agentRuns.list": pending } } },
};
export const AgentError: Story = {
	...AgentAssigned,
	parameters: { trellis: { responses: { "agentRuns.list": failure } } },
};
export const AgentDisabled: Story = { render: () => <TicketAgent ticket={ticket.identifier} disabled /> };
export const UnassignConfirmation: Story = { ...AgentAssigned, play: clickButton("Unassign agent") };
export const UnassignPending: Story = {
	...AgentAssigned,
	parameters: { trellis: { responses: { "agentRuns.stop": pending } } },
	play: async (context) => {
		await clickButton("Unassign agent")(context);
		const dialog = await within(context.canvasElement.ownerDocument.body).findByRole("dialog");
		await userEvent.click(within(dialog).getByRole("button", { name: "Unassign agent" }));
	},
};
