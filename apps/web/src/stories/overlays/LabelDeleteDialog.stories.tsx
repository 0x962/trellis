import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelDeleteDialog } from "../../features/project-settings/LabelDeleteDialog";
import { failure, labels, noop, pending, responses } from "./fixtures";
import { clickButton } from "./interactions";
import { OverlayTrigger } from "./OverlayTrigger";

const meta = {
	title: "Overlays/LabelDeleteDialog",
	component: LabelDeleteDialog,
	args: { project: "DEMO", label: labels[0]!, onDeleted: async () => {}, onClose: noop },
	parameters: { trellis: { responses: { ...responses, "labels.delete": {} } } },
	render: (args, context) => (
		<OverlayTrigger label="Open confirmation" initiallyOpen={!context.parameters.closed}>
			{(close) => <LabelDeleteDialog {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof LabelDeleteDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "labels.delete": pending } } },
	play: clickButton("Delete label"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "labels.delete": failure } } },
	play: clickButton("Delete label"),
};
export const Success: Story = { play: clickButton("Delete label") };
export const Empty: Story = { args: { label: { ...labels[0]!, ticketCount: 0 } } };
