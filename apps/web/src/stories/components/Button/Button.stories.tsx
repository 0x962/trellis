import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@trellis/ui";

const meta = {
	title: "Components/Button",
	component: Button,
	args: { children: "Save", onClick: () => {} },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Primary: Story = { args: { variant: "primary" } };
export const Quiet: Story = { args: { variant: "quiet" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete" } };
export const Disabled: Story = { args: { disabled: true } };
export const Processing: Story = { args: { processing: true } };
export const Medium: Story = { args: { size: "md" } };
export const Shortcut: Story = { args: { kbd: "Enter" } };
export const LongLabel: Story = { args: { children: "Save all project settings" } };
export const DangerSoft: Story = { args: { variant: "danger-soft" } };
export const AlignStart: Story = { args: { align: "start", className: "w-64" } };
