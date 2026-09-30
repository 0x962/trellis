import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { WavePicker } from "../../features/pickers/WavePicker";
import { noop, pending, responses } from "./fixtures";

const meta = {
	title: "Overlays/WavePicker",
	component: WavePicker,
	args: { epic: "DEMO/catalog", onPick: noop, trigger: <PickerButton label="Wave">Wave</PickerButton> },
	parameters: { trellis: { responses } },
} satisfies Meta<typeof WavePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Wave" disabled>
				Wave
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: "DEMO/catalog/first-wave" } };
export const Mixed: Story = { args: { open: true, mixed: true } };
export const CreateWave: Story = { args: { open: true, onCreate: noop } };
export const Empty: Story = {
	args: { open: true, allowNone: false },
	parameters: { trellis: { responses: { "epics.get": { ...responses["epics.get"], waves: [] } } } },
};
export const Loading: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "epics.get": pending } } },
};
