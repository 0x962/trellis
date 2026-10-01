import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteEpicDialog } from "../../features/epics/DeleteEpicDialog";
import { epic, failure, noop, pending, responses } from "./fixtures";
import { clickButton } from "./interactions";
import { OverlayTrigger } from "./OverlayTrigger";

const meta = {
	title: "Overlays/DeleteEpicDialog",
	component: DeleteEpicDialog,
	args: { epic, open: true, onOpenChange: noop },
	parameters: { trellis: { responses: { ...responses, "epics.delete": {} } } },
	render: (args, context) => (
		<OverlayTrigger label="Open confirmation" initiallyOpen={!context.parameters.closed}>
			{(close) => (
				<DeleteEpicDialog
					{...args}
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
} satisfies Meta<typeof DeleteEpicDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "epics.delete": pending } } },
	play: clickButton("Delete epic"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "epics.delete": failure } } },
	play: clickButton("Delete epic"),
};
export const Success: Story = { play: clickButton("Delete epic") };
export const Empty: Story = {
	args: { epic: { ...epic, counts: { total: 0, todo: 0, started: 0, review: 0, done: 0, canceled: 0 } } },
};
