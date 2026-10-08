import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusDeleteDialog } from "../../features/project-settings/StatusDeleteDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, responses, statuses } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/StatusDeleteDialog",
	component: StatusDeleteDialog,
	args: {
		project: "DEMO",
		status: statuses[0]!,
		statuses,
		ticketCount: 0,
		busy: false,
		onWrite: async (operation) => operation(),
		onDeleted: async () => {},
		onClose: noop,
	},
	parameters: { trellis: { responses: { ...responses, "statuses.delete": {} } } },
	render: (args, context) => (
		<OverlayTrigger label="Open confirmation" initiallyOpen={!context.parameters.closed}>
			{(close) => <StatusDeleteDialog {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof StatusDeleteDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "statuses.delete": failure } } },
	play: clickButton("Delete status"),
};
export const Success: Story = { play: clickButton("Delete status") };
export const InUse: Story = { args: { ticketCount: 3 } };
export const Processing: Story = { args: { ticketCount: 3, busy: true } };
export const LastStatus: Story = { args: { statuses: [statuses[0]!] } };
