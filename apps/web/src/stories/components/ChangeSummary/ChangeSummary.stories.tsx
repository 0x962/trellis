import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChangeSummary } from "@trellis/ui/review";

const meta = {
	title: "Components/ChangeSummary",
	component: ChangeSummary,
	args: {
		summary: {
			headline: "The project retains the ticket selection",
			why: <p>The selected tickets remain visible after the user closes a review.</p>,
		},
	},
} satisfies Meta<typeof ChangeSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { summary: null } };
export const LongContent: Story = {
	args: {
		summary: {
			headline: "The project retains the ticket selection after a review opens over the current page",
			why: <p>{"The selected tickets remain visible after the user closes a review. ".repeat(20)}</p>,
		},
	},
};
