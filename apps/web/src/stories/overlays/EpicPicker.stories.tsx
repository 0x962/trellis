import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { EpicPicker } from "../../features/pickers/EpicPicker";
import { useStoryState } from "../components/useStoryState";
import { noop, pending, responses } from "./fixtures";
import { chooseAndReopen } from "./interactions";

const meta = {
	title: "Overlays/EpicPicker",
	component: EpicPicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		const [mixed, setMixed] = useStoryState(args.mixed);
		return (
			<EpicPicker
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
	args: { project: "DEMO", onPick: noop, trigger: <PickerButton label="Epic">Epic</PickerButton> },
	parameters: { trellis: { responses } },
} satisfies Meta<typeof EpicPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Epic" disabled>
				Epic
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: "DEMO/catalog" } };
export const Mixed: Story = { args: { open: true, mixed: true } };
export const Empty: Story = {
	args: { open: true, allowNone: false },
	parameters: { trellis: { responses: { "epics.list": [] } } },
};
export const Loading: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "epics.list": pending } } },
};

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Epic", "Component catalog"),
};
