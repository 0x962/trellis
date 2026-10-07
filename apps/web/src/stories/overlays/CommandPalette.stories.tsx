import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { CommandPalette } from "../../features/command/CommandPalette";
import { commandActions } from "../../features/command/commandStore";
import { PageSheetHost } from "../../features/shell/PageSheetHost";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { projectResponses } from "../pages/fixtures/responses";
import { failure, pending, responses, ticket, tickets } from "./fixtures";

const meta = {
	title: "Overlays/CommandPalette",
	component: CommandPalette,
	parameters: {
		trellis: {
			path: "/p/DEMO/board",
			responses: {
				...projectResponses,
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
		pageSheetActions.closeTicket();
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
			<PageSheetHost />
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
export const Open: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		const field = await body.findByRole("combobox", { name: "Type a command or search tickets" });
		await waitFor(() => {
			const activeId = field.getAttribute("aria-activedescendant");
			expect(activeId).not.toBeNull();
			expect(canvasElement.ownerDocument.getElementById(activeId!)).toHaveTextContent("New ticket");
		});
	},
};
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
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		const field = await body.findByRole("combobox", { name: "Type a command or search tickets" });
		await userEvent.type(field, "Toggle theme");
		await expect(await body.findByRole("option", { name: /Toggle theme/ })).toBeVisible();
		await expect(await body.findByText("Searching tickets")).toBeVisible();
		const listId = field.getAttribute("aria-controls");
		await expect(listId).not.toBeNull();
		await expect(canvasElement.ownerDocument.getElementById(listId!)).toBeVisible();
		const activeId = field.getAttribute("aria-activedescendant");
		await expect(activeId).not.toBeNull();
	},
};
export const SearchError: Story = {
	parameters: { trellis: { responses: { "search.query": failure } } },
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		const field = await body.findByRole("combobox", { name: "Type a command or search tickets" });
		await userEvent.type(field, "Toggle theme");
		const localCommand = await body.findByRole("option", { name: /Toggle theme/ });
		await expect(localCommand).toBeVisible();
		await expect(await body.findByRole("alert")).toHaveTextContent("Ticket search did not load");
		await expect(localCommand).toBeVisible();
		const listId = field.getAttribute("aria-controls");
		await expect(listId).not.toBeNull();
		await expect(context.canvasElement.ownerDocument.getElementById(listId!)).toBeVisible();
		const activeId = field.getAttribute("aria-activedescendant");
		await expect(activeId).not.toBeNull();
		await expect(context.canvasElement.ownerDocument.getElementById(activeId!)).toHaveTextContent("Toggle theme");
		await userEvent.clear(field);
		await userEvent.type(field, "DEMO-99");
		await expect(await body.findByRole("option", { name: /Open DEMO-99/ })).toBeVisible();
	},
};
export const Status: Story = { parameters: { ticket: true }, play: choose(/^Change status/) };
export const Priority: Story = { parameters: { ticket: true }, play: choose(/^Set priority/) };
export const Parent: Story = {
	parameters: { ticket: true },
	play: async (context) => {
		await choose(/^Set parent/)(context);
		const body = within(context.canvasElement.ownerDocument.body);
		const field = await body.findByRole("combobox", { name: "Set parent" });
		await userEvent.type(field, "DEMO");
		await expect(field).toHaveAccessibleName("Set parent");
		await userEvent.click(await body.findByRole("button", { name: "Back to commands" }));
		await expect(await body.findByRole("combobox", { name: "Type a command or search tickets" })).toBeVisible();
	},
};
export const OpenTicketAndReturn: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		const trigger = await body.findByRole("button", { name: "Open commands" });
		const field = await body.findByRole("combobox", { name: "Type a command or search tickets" });
		await userEvent.type(field, "catalog");
		await waitFor(() => {
			const activeId = field.getAttribute("aria-activedescendant");
			expect(activeId).not.toBeNull();
			expect(canvasElement.ownerDocument.getElementById(activeId!)).toHaveTextContent("DEMO-1");
		});
		await userEvent.keyboard("{Enter}");
		const dialog = await body.findByRole("dialog", { name: "DEMO-1" });
		await waitFor(() => expect(dialog).toBeVisible());
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(body.queryByRole("dialog", { name: "DEMO-1" })).not.toBeInTheDocument());
		await expect(trigger).toBeVisible();
	},
};
export const Labels: Story = { parameters: { ticket: true }, play: choose(/^Set labels/) };
export const Epic: Story = { parameters: { selection: true }, play: choose(/^Set epic/) };
export const Wave: Story = { parameters: { selection: true }, play: choose(/^Set wave/) };
export const Group: Story = { play: choose(/^Group by/) };
export const Sort: Story = { play: choose(/^Sort by/) };
export const DeleteConfirmation: Story = { parameters: { ticket: true }, play: choose(/^Delete/) };
export const BulkDeleteConfirmation: Story = { parameters: { selection: true }, play: choose(/^Delete/) };
