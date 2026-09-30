import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { LabelPicker } from "../../features/pickers/LabelPicker";
import { labels, noop, pending, responses } from "./fixtures";

const meta = {
	title: "Overlays/LabelPicker",
	component: LabelPicker,
	args: { project: "DEMO", checked: [], onToggle: noop, trigger: <PickerButton label="Label">Label</PickerButton> },
	parameters: { trellis: { responses } },
} satisfies Meta<typeof LabelPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Label" disabled>
				Label
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, checked: [labels[0]!.id] } };
export const Mixed: Story = { args: { open: true, mixed: [labels[1]!.id] } };
export const Empty: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "labels.list": { labels: [], groups: [] } } } },
};
export const Loading: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "labels.list": pending } } },
};
