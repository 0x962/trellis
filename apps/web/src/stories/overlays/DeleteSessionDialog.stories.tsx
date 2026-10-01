import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteSessionDialog } from "../../features/sessions/DeleteSessionDialog";
import { failure, noop, pending, responses, session } from "./fixtures";
import { clickButton } from "./interactions";
import { OverlayTrigger } from "./OverlayTrigger";

const meta = {
	title: "Overlays/DeleteSessionDialog",
	component: DeleteSessionDialog,
	args: { session, open: true, onOpenChange: noop },
	parameters: { trellis: { responses: { ...responses, "sessions.delete": {} } } },
	render: (args, context) => (
		<OverlayTrigger label="Open confirmation" initiallyOpen={!context.parameters.closed}>
			{(close) => (
				<DeleteSessionDialog
					{...args}
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
} satisfies Meta<typeof DeleteSessionDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "sessions.delete": pending } } },
	play: clickButton("Delete session"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "sessions.delete": failure } } },
	play: clickButton("Delete session"),
};
export const Success: Story = { play: clickButton("Delete session") };
