import type { Meta, StoryObj } from "@storybook/react-vite";
import { OutputBlock } from "@trellis/ui";

const meta = {
	title: "Components/OutputBlock",
	component: OutputBlock,
	args: { text: "Checked 42 files.\nAll checks pass." },
} satisfies Meta<typeof OutputBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { text: "" } };
export const LongContent: Story = {
	args: {
		text: Array.from({ length: 80 }, (_, index) => `Check ${index + 1}: passed`).join("\n"),
		maxHeight: "max-h-40",
	},
};
