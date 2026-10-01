import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { MergeDialog } from "../../features/reviews/ReviewHeaderActions/components/MergeDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, pending, responses, tickets } from "./fixtures";

const meta = {
	title: "Overlays/MergeDialog",
	component: MergeDialog,
	args: { pr: "https://github.com/example/catalog/pull/12", processing: false, onMerge: noop, onClose: noop },
	parameters: { trellis: { responses: { ...responses, "reviews.mergeTickets": tickets } } },
	render: (args, context) => (
		<OverlayTrigger label="Merge pull request" initiallyOpen={!context.parameters.closed}>
			{(close) => <MergeDialog {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof MergeDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Empty: Story = { parameters: { trellis: { responses: { "reviews.mergeTickets": [] } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "reviews.mergeTickets": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "reviews.mergeTickets": failure } } } };
export const Pending: Story = { args: { processing: true } };
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(
			await within(canvasElement.ownerDocument.body).findByRole("checkbox", { name: "Admin merge" }),
		);
	},
};
