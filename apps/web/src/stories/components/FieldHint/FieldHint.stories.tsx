import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldHint } from "@trellis/ui";

const meta = {
	title: "Components/FieldHint",
	component: FieldHint,
	args: { children: "Every ticket identifier starts with TRL." },
} satisfies Meta<typeof FieldHint>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ErrorState: Story = { args: { tone: "danger", children: "Use uppercase letters." } };
export const LongContent: Story = {
	args: {
		children: "The selected project supplies the repository and the default settings for every ticket in this wave.",
	},
};
