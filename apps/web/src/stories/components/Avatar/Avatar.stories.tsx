import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "@trellis/ui";

const meta = {
	title: "Components/Avatar",
	component: Avatar,
	args: { kind: "human", name: "Dana Lee" },
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Agent: Story = { args: { kind: "agent", name: "Review agent" } };
export const Starting: Story = { args: { kind: "agent", state: "starting" } };
export const Working: Story = { args: { kind: "agent", state: "working" } };
export const Profile: Story = {
	args: { kind: "agent", agentProfile: { provider: "openai", model: "GPT-6 Astra", effort: "High" } },
};
export const Large: Story = { args: { className: "size-16" } };
export const LongName: Story = { args: { name: "Alexandra Catherine Montgomery" } };
export const StatusStarting: Story = { args: { kind: "agent", status: "starting" } };
export const StatusWorking: Story = { args: { kind: "agent", status: "working" } };
export const StatusNeedsInput: Story = { args: { kind: "agent", status: "needs-input" } };
export const StatusDone: Story = { args: { kind: "agent", status: "done" } };
export const StatusIdle: Story = { args: { kind: "agent", status: "idle" } };
export const StatusFailed: Story = { args: { kind: "agent", status: "failed" } };
export const StatusInterrupted: Story = { args: { kind: "agent", status: "interrupted" } };
export const StatusUnavailable: Story = { args: { kind: "agent", status: "unavailable" } };
