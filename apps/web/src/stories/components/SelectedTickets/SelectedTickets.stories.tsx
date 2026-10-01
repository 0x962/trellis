import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectedTickets } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/SelectedTickets",
	component: SelectedTickets,
	args: {
		items: [
			{ identifier: "TRL-42", title: "Restore the project view", status: "todo" },
			{ identifier: "TRL-43", title: "Retain the ticket selection", status: "started" },
		],
		onRemove: async () => {},
		pending: false,
		removing: null,
		loading: false,
		error: null,
		retry: () => {},
	},
	render: function Render(args) {
		const [items, setItems] = useStoryState(args.items);
		return (
			<SelectedTickets
				{...args}
				items={items}
				onRemove={async (ticket) => setItems(items.filter((item) => item.identifier !== ticket.identifier))}
			/>
		);
	},
} satisfies Meta<typeof SelectedTickets>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { items: [] } };
export const Loading: Story = { args: { items: [], loading: true } };
export const ErrorState: Story = { args: { items: [], error: new globalThis.Error("The tickets do not load.") } };
export const Pending: Story = { args: { pending: true } };
export const Removing: Story = { args: { removing: "TRL-42" } };
export const ManyTickets: Story = {
	args: {
		items: Array.from({ length: 80 }, (_, index) => ({
			identifier: `TRL-${index + 1}`,
			title: `Review ticket ${index + 1}`,
			status: "todo",
		})),
	},
};
