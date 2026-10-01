import type { Meta, StoryObj } from "@storybook/react-vite";
import { WaveStartDialog } from "../../features/table/WaveStart/WaveStartDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, pending, responses, run, tickets } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/WaveStartDialog",
	component: WaveStartDialog,
	args: { open: true, onOpenChange: noop, wave: "First wave", tickets, assigned: new Set<string>() },
	parameters: { trellis: { responses: { ...responses, "agentRuns.start": run } } },
	render: (args, context) => (
		<OverlayTrigger label="Start wave" initiallyOpen={!context.parameters.closed}>
			{(close) => (
				<WaveStartDialog
					{...args}
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
} satisfies Meta<typeof WaveStartDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Empty: Story = { args: { tickets: [] } };
export const Disabled: Story = { args: { assigned: new Set(tickets.map(({ id }) => id)) } };
export const Waiting: Story = {
	args: {
		tickets: tickets.map((ticket) => ({
			...ticket,
			ready: false,
			waitsOn: [{ identifier: "DEMO-3", title: "Prepare shared fixtures", status: "started" }],
		})),
	},
};
export const Pending: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": pending } } },
	play: clickButton("Start 2 agents"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": failure } } },
	play: clickButton("Start 2 agents"),
};
export const Success: Story = { play: clickButton("Start 2 agents") };
