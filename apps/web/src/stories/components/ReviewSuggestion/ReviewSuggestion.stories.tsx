import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewSuggestion } from "@trellis/ui/review";

const meta = {
	title: "Components/ReviewSuggestion",
	component: ReviewSuggestion,
	args: {
		state: "open",
		lines: [
			{ type: "context", text: "function projectName() {" },
			{ type: "deletion", text: "  return 'Old';", marks: [[10, 13]] },
			{ type: "addition", text: "  return 'Trellis';", marks: [[10, 17]] },
			{ type: "context", text: "}" },
		],
	},
} satisfies Meta<typeof ReviewSuggestion>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Applied: Story = { args: { state: "applied" } };
export const Outdated: Story = { args: { state: "outdated" } };
export const Preview: Story = { args: { state: "preview" } };
export const Invalid: Story = { args: { state: "invalid" } };
export const Unknown: Story = { args: { state: "unknown" } };
