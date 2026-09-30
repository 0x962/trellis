import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineChanges } from "@trellis/ui";

const meta = {
	title: "Components/LineChanges",
	component: LineChanges,
	args: { value: { additions: 28, deletions: 4 }, pending: false },
} satisfies Meta<typeof LineChanges>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { value: null, pending: true } };
export const Unavailable: Story = { args: { value: null } };
export const Zero: Story = { args: { value: { additions: 0, deletions: 0 } } };
export const AdditionOnly: Story = { args: { value: { additions: 12, deletions: 0 } } };
export const DeletionOnly: Story = { args: { value: { additions: 0, deletions: 12 } } };
export const LargeCounts: Story = { args: { value: { additions: 123456, deletions: 76543 } } };
export const AlignStart: Story = { args: { align: "start" } };
