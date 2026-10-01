import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/IconButton",
	component: IconButton,
	args: { label: "Add ticket", icon: <Plus />, onClick: () => {} },
	render: function Render(args) {
		const [pressed, setPressed] = useStoryState(args.pressed);
		return (
			<Tooltip content={args.label}>
				<IconButton
					{...args}
					pressed={pressed}
					onClick={pressed === undefined ? args.onClick : () => setPressed(!pressed)}
				/>
			</Tooltip>
		);
	},
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Processing: Story = { args: { processing: true } };
export const Pressed: Story = { args: { pressed: true } };
export const ExtraSmall: Story = { args: { size: "xs" } };
export const Medium: Story = { args: { size: "md" } };
export const Primary: Story = { args: { variant: "primary" } };
export const Danger: Story = { args: { variant: "danger" } };
export const DefaultVariant: Story = { args: { variant: "default" } };
export const DangerSoft: Story = { args: { variant: "danger-soft" } };
export const Toggle: Story = {
	args: { pressed: true },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", { name: "Add ticket" });
		await expect(button).toHaveAttribute("aria-pressed", "true");
		await userEvent.click(button);
		await expect(button).toHaveAttribute("aria-pressed", "false");
		await userEvent.keyboard(" ");
		await expect(button).toHaveAttribute("aria-pressed", "true");
	},
};
