import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuotaWindows } from "@trellis/ui";

const meta = {
	title: "Components/QuotaWindows",
	component: QuotaWindows,
	args: {
		name: "Work account",
		windows: [
			{ id: "session", label: "Session", usedPercent: 24, resetsAt: "2026-09-30T18:00:00Z" },
			{ id: "week", label: "Week", usedPercent: 58, resetsAt: null },
		],
	},
} satisfies Meta<typeof QuotaWindows>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { windows: [] } };
export const Warning: Story = { args: { windows: [{ id: "week", label: "Week", usedPercent: 65, resetsAt: null }] } };
export const Exhausted: Story = {
	args: { windows: [{ id: "week", label: "Week", usedPercent: 100, resetsAt: null }] },
};
export const Zero: Story = { args: { windows: [{ id: "week", label: "Week", usedPercent: 0, resetsAt: null }] } };
