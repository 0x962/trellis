import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckRibbon } from "@trellis/ui";

const meta = {
	title: "Components/CheckRibbon",
	component: CheckRibbon,
	args: {
		checks: [
			{ name: "Lint", bucket: "pass" },
			{ name: "Types", bucket: "pass" },
		],
	},
} satisfies Meta<typeof CheckRibbon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { checks: [] } };
export const Failed: Story = { args: { checks: [{ name: "Tests", bucket: "fail" }] } };
export const Pending: Story = { args: { checks: [{ name: "Build", bucket: "pending" }] } };
export const Canceled: Story = { args: { checks: [{ name: "Build", bucket: "cancel" }] } };
export const Skipped: Story = { args: { checks: [{ name: "Deploy", bucket: "skipping" }] } };
export const Mini: Story = { args: { size: "mini" } };
export const Wide: Story = { args: { size: "wide" } };
export const Crowded: Story = {
	args: {
		checks: Array.from({ length: 80 }, (_, index) => ({
			name: `Check ${index + 1}`,
			bucket: index === 40 ? "fail" : "pass",
		})),
	},
};
export const Decorative: Story = { args: { decorative: true } };
