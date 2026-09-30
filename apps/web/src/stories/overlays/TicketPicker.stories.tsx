import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { TicketPicker } from "../../features/pickers/TicketPicker";
import { noop, responses, ticket } from "./fixtures";
import { fillField } from "./interactions";

const meta = {
	title: "Overlays/TicketPicker",
	component: TicketPicker,
	args: { project: "DEMO", onPick: noop, trigger: <PickerButton label="Ticket">Ticket</PickerButton> },
	parameters: { trellis: { responses } },
} satisfies Meta<typeof TicketPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Ticket" disabled>
				Ticket
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: ticket.identifier } };
export const Empty: Story = { args: { open: true, allowNone: false } };
export const SearchResults: Story = {
	args: { open: true },
	play: async ({ canvasElement }) => {
		await fillField(canvasElement, "Search tickets", "catalog");
	},
};
const selection = {
	items: [],
	onRemove: async () => {},
	pending: false,
	removing: null,
	loading: false,
	error: null,
	retry: noop,
};
export const SelectionLoading: Story = {
	args: { open: true, onAdd: noop, selection: { ...selection, loading: true } },
};
export const SelectionPending: Story = {
	args: { open: true, onAdd: noop, selection: { ...selection, pending: true } },
};
export const SelectionError: Story = {
	args: { open: true, onAdd: noop, selection: { ...selection, error: new Error("The dependencies did not load.") } },
};
