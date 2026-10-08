import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowDecisionContext } from "@trellis/ui";

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
	args: { outputs: [{ key: "review", title: "Code review", text: "The checks pass.\n".repeat(80) }] },
};
