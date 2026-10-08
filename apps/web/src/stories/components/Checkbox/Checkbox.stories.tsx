import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Checkbox",
	component: Checkbox,
	args: { label: "Include completed tickets", checked: false, onCheckedChange: () => {} },
	parameters: { docs: { description: { component: "Click the control or press Space to change its value." } } },
	render: function Render(args) {
		const [checked, setChecked] = useStoryState(args.checked);
		const [indeterminate, setIndeterminate] = useStoryState(args.indeterminate);
		return (
			<Checkbox
				{...args}
				checked={checked}
				indeterminate={indeterminate}
				onCheckedChange={(next) => {
					setChecked(next);
					setIndeterminate(false);
				}}
			/>
		);
	},
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, checked: true } };
export const Mixed: Story = { args: { indeterminate: true } };
export const HiddenLabel: Story = { args: { hideLabel: true } };
export const MixedInteraction: Story = {
	args: Mixed.args,
	play: async ({ canvasElement }) => {
		const checkbox = await within(canvasElement).findByRole("checkbox", { name: "Include completed tickets" });
		await expect(checkbox).toHaveAttribute("aria-checked", "mixed");
		await userEvent.click(checkbox);
		await expect(checkbox).toHaveAttribute("aria-checked", "true");
		await userEvent.keyboard(" ");
		await expect(checkbox).toHaveAttribute("aria-checked", "false");
	},
};
