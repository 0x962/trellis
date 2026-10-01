import { ORPCError } from "@orpc/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusDeleteDialog } from "../../features/project-settings/StatusDeleteDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, responses, statuses } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/StatusDeleteDialog",
	component: StatusDeleteDialog,
	args: { project: "DEMO", status: statuses[0]!, statuses, onDeleted: async () => {}, onClose: noop },
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
export const InUse: Story = {
	parameters: {
		trellis: {
			responses: {
				"statuses.delete": () => {
					throw new ORPCError("STATUS_IN_USE", { data: { count: 3 } });
				},
			},
		},
	},
	play: clickButton("Delete status"),
};
export const LastStatus: Story = {
	args: { statuses: [statuses[0]!] },
	parameters: {
		trellis: {
			responses: {
				"statuses.delete": () => {
					throw new ORPCError("LAST_STATUS");
				},
			},
		},
	},
	play: clickButton("Delete status"),
};
