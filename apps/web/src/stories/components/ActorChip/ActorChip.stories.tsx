import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActorChip } from "@trellis/ui";

const meta = {
	title: "Components/ActorChip",
	component: ActorChip,
	args: { name: "Dana Lee", kind: "human" },
} satisfies Meta<typeof ActorChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Agent: Story = { args: { kind: "agent", name: "Review agent" } };
export const Compact: Story = { args: { compact: true } };
export const Profile: Story = {
	args: { kind: "agent", name: "Codex", agentProfile: { provider: "openai", model: "GPT-6 Astra", effort: "High" } },
};
export const LongName: Story = { args: { name: "Alexandra Catherine Montgomery" } };
