import type { Meta, StoryObj } from "@storybook/react-vite";
import { type SelectedTicket, SelectedTickets } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const tickets: SelectedTicket[] = [
	{ identifier: "TRL-42", title: "Restore the project view", status: "todo" },
	{ identifier: "TRL-43", title: "Retain the ticket selection", status: "started" },
];

const meta = {
	title: "Components/SelectedTickets",
	component: SelectedTickets,
	args: {
		items: tickets,
		onRemove: async () => {},
		pending: false,
		removing: null,
		loading: false,
		error: null,
		retry: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Remove updates the local relationship list. Retry restores two fixture tickets. Arrow keys move between removal controls.",
			},
		},
	},
	render: function Render(args) {
		const [items, setItems] = useStoryState(args.items);
		const [error, setError] = useStoryState(args.error);
		return (
			<SelectedTickets
				{...args}
				items={items}
				error={error}
				retry={() => {
					setError(null);
					setItems(tickets);
				}}
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
export const RetryAndRemove: Story = {
	args: { items: [], error: new globalThis.Error("The tickets do not load.") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
		await userEvent.click(canvas.getByRole("button", { name: "Remove TRL-42" }));
		await expect(canvas.queryByRole("button", { name: "Remove TRL-42" })).not.toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Remove TRL-43" })).toBeEnabled();
	},
};
export const ManyTickets: Story = {
	args: {
		items: Array.from({ length: 80 }, (_, index) => ({
			identifier: `TRL-${index + 1}`,
			title: `Review ticket ${index + 1}`,
			status: "todo",
		})),
	},
};
