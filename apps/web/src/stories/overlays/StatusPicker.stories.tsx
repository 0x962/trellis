import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { StatusPicker } from "../../features/pickers/StatusPicker";
import { useStoryState } from "../components/useStoryState";
import { noop, statuses } from "./fixtures";
import { chooseAndReopen } from "./interactions";

const meta = {
	title: "Overlays/StatusPicker",
	component: StatusPicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		return (
			<StatusPicker
				{...args}
				open={open}
				value={value}
				onOpenChange={setOpen}
				onPick={(picked) => setValue(picked.id)}
			/>
		);
	},
	args: { statuses, onPick: noop, trigger: <PickerButton label="Status">Status</PickerButton> },
} satisfies Meta<typeof StatusPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Status" disabled>
				Status
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: statuses[1]!.id } };
export const Empty: Story = { args: { open: true, statuses: [] } };

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Status", "In progress"),
};
