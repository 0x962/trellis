import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowDecisionContext } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";

const meta = {
	title: "Components/FlowDecisionContext",
	component: FlowDecisionContext,
	args: {
		title: "Approve the change",
		instruction: "Review the result and select a decision.",
		outputs: [{ key: "review", title: "Code review", text: "The checks pass." }],
	},
} satisfies Meta<typeof FlowDecisionContext>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithoutOutput: Story = { args: { outputs: [] } };
export const LongOutput: Story = {
	args: {
		instruction: "Review the complete retained result before you choose a decision. ".repeat(12),
		outputs: [{ key: "review", title: "Code review", text: "The checks pass.\n".repeat(80) }],
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.tab();
		await expect(canvas.getByRole("region", { name: "Decision context" })).toHaveFocus();
	},
};
