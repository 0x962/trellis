import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckRing } from "@trellis/ui";

const meta = {
	title: "Components/CheckRing",
	component: CheckRing,
	args: { counts: { success: 8, failed: 1, running: 2 }, className: "size-12" },
} satisfies Meta<typeof CheckRing>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { counts: {} } };
export const Success: Story = { args: { counts: { success: 10 } } };
export const Failed: Story = { args: { counts: { failed: 10 } } };
export const Pending: Story = { args: { counts: { pending: 10 } } };
export const AllStates: Story = {
	args: { counts: { success: 3, failed: 1, running: 1, pending: 1, canceled: 1, unknown: 1, neutral: 1, skipped: 1 } },
};
export const RareFailure: Story = { args: { counts: { success: 999, failed: 1 } } };
