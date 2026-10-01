import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { WavePicker } from "../../features/pickers/WavePicker";
import { useStoryState } from "../components/useStoryState";
import { noop, pending, responses } from "./fixtures";
import { chooseAndReopen } from "./interactions";

const meta = {
	title: "Overlays/WavePicker",
	component: WavePicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		const [mixed, setMixed] = useStoryState(args.mixed);
		return (
			<WavePicker
				{...args}
				open={open}
				value={value}
				onOpenChange={setOpen}
				mixed={mixed}
				onPick={(picked) => {
					setValue(picked?.ref);
					setMixed(false);
				}}
			/>
		);
	},
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

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Wave", "First wave"),
};
