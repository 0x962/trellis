import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "@trellis/ui";

const meta = {
	title: "Components/Chip",
	component: Chip,
	args: { label: "Priority", op: "is", value: "High" },
} satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Removable: Story = { args: { onRemove: () => {} } };
export const Editable: Story = { args: { onOpClick: () => {}, onValueClick: () => {}, onRemove: () => {} } };
export const LongContent: Story = { args: { value: "Urgent, high, and medium priority tickets" } };
