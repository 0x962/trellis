import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { TicketPicker } from "../../features/pickers/TicketPicker";
import { useStoryState } from "../components/useStoryState";
import { noop, responses, ticket } from "./fixtures";
import { chooseAndReopen, fillField } from "./interactions";

const meta = {
	title: "Overlays/TicketPicker",
	component: TicketPicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		return (
			<TicketPicker
				{...args}
				open={open}
				value={value}
				onOpenChange={setOpen}
				onPick={(picked) => setValue(picked?.identifier)}
			/>
		);
	},
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

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Ticket", /^DEMO-1/, { label: "Search tickets", value: "catalog" }),
};
