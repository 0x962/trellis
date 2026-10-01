import type { Meta, StoryObj } from "@storybook/react-vite";
import { EpicSheet } from "../../features/epics/EpicSheet";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { epic, failure, noop, pending, project, responses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/EpicSheet",
	component: EpicSheet,
	args: { project, onClose: noop },
	parameters: { trellis: { responses: { ...responses, "epics.create": epic, "epics.update": epic } } },
	render: (args, context) => (
		<OverlayTrigger label="New epic" initiallyOpen={!context.parameters.closed}>
			{(close) => <EpicSheet {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof EpicSheet>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Name", "Catalog review");
	await clickButton("Create epic")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Edit: Story = { args: { epic } };
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		await fillField(canvasElement, "Name", "Catalog review");
		await fillField(canvasElement, "Description", "Review the catalog in both themes.");
	},
};
export const Pending: Story = { parameters: { trellis: { responses: { "epics.create": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "epics.create": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
