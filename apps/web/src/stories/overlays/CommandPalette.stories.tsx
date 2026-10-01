import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";
import { userEvent, within } from "storybook/test";
import { CommandPalette } from "../../features/command/CommandPalette";
import { commandActions } from "../../features/command/commandStore";
import { failure, pending, responses, ticket, tickets } from "./fixtures";

const meta = {
	title: "Overlays/CommandPalette",
	component: CommandPalette,
	parameters: {
		trellis: {
			path: "/p/DEMO/board",
			responses: {
				...responses,
				"tickets.get": ticket,
				"tickets.list": { items: tickets, total: 2, nextCursor: null },
				"tickets.delete": { deleted: ticket.identifier },
				"tickets.deleteMany": { deleted: 2, failures: [] },
			},
		},
	},
	beforeEach: (context) => {
		commandActions.setRoute("/p/DEMO/board");
		if (context.parameters.ticket) commandActions.setFocusedTicket(ticket.identifier);
		if (context.parameters.selection) commandActions.setSelection(tickets);
		if (!context.parameters.closed) commandActions.open(context.parameters.mode ?? "commands");
	},
	render: () => (
		<>
			<Tooltip content="Open commands">
				<IconButton label="Open commands" icon={<MagnifyingGlass />} onClick={() => commandActions.open("commands")} />
			</Tooltip>
			<CommandPalette />
		</>
	),
} satisfies Meta<typeof CommandPalette>;
export default meta;
type Story = StoryObj<typeof meta>;
const choose = (name: string | RegExp) => async (context: { canvasElement: HTMLElement }) => {
	await userEvent.click(await within(context.canvasElement.ownerDocument.body).findByRole("option", { name }));
};
const search = async (context: { canvasElement: HTMLElement }) => {
	await userEvent.type(
		await within(context.canvasElement.ownerDocument.body).findByPlaceholderText("Type a command or search tickets"),
		"catalog",
	);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const TicketContext: Story = { parameters: { ticket: true } };
export const Selected: Story = { parameters: { selection: true } };
export const Projects: Story = { parameters: { mode: "projects" } };
export const Search: Story = { play: search };
export const SearchEmpty: Story = {
	parameters: { trellis: { responses: { "search.query": { tickets: [], pages: [], projects: [], epics: [] } } } },
	play: search,
};
export const SearchLoading: Story = {
	parameters: { trellis: { responses: { "search.query": pending } } },
	play: search,
};
export const SearchError: Story = { parameters: { trellis: { responses: { "search.query": failure } } }, play: search };
export const Status: Story = { parameters: { ticket: true }, play: choose(/^Change status/) };
export const Priority: Story = { parameters: { ticket: true }, play: choose(/^Set priority/) };
export const Parent: Story = { parameters: { ticket: true }, play: choose(/^Set parent/) };
export const Labels: Story = { parameters: { ticket: true }, play: choose(/^Set labels/) };
export const Epic: Story = { parameters: { selection: true }, play: choose(/^Set epic/) };
export const Wave: Story = { parameters: { selection: true }, play: choose(/^Set wave/) };
export const Group: Story = { play: choose(/^Group by/) };
export const Sort: Story = { play: choose(/^Sort by/) };
export const DeleteConfirmation: Story = { parameters: { ticket: true }, play: choose(/^Delete/) };
export const BulkDeleteConfirmation: Story = { parameters: { selection: true }, play: choose(/^Delete/) };
