import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelGroupDeleteDialog } from "../../features/project-settings/LabelGroupDeleteDialog";
import { at, failure, id, labels, noop, pending, project, responses } from "./fixtures";
import { clickButton } from "./interactions";
import { OverlayTrigger } from "./OverlayTrigger";

const meta = {
	title: "Overlays/LabelGroupDeleteDialog",
	component: LabelGroupDeleteDialog,
	args: {
		project: "DEMO",
		group: { id: id(80), projectId: project.id, name: "Type", createdAt: at, updatedAt: at },
		labels,
		onDeleted: async () => {},
		onClose: noop,
	},
	parameters: { trellis: { responses: { ...responses, "labelGroups.delete": {} } } },
	render: (args, context) => (
		<OverlayTrigger label="Open confirmation" initiallyOpen={!context.parameters.closed}>
			{(close) => <LabelGroupDeleteDialog {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof LabelGroupDeleteDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "labelGroups.delete": pending } } },
	play: clickButton("Delete group"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "labelGroups.delete": failure } } },
	play: clickButton("Delete group"),
};
export const Success: Story = { play: clickButton("Delete group") };
export const Empty: Story = { args: { labels: [] } };
