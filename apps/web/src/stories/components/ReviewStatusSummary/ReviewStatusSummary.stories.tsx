import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStatusSummary } from "@trellis/ui";

const meta = {
	title: "Components/ReviewStatusSummary",
	component: ReviewStatusSummary,
	args: {
		reviews: [
			{ owner: "example", repo: "trellis", number: 42, state: "open", askedForReview: true, locallyApproved: false },
		],
	},
	parameters: {
		docs: { description: { component: "Hover or focus the overflow count to inspect every pull request status." } },
	},
} satisfies Meta<typeof ReviewStatusSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { reviews: [] } };
export const AllStates: Story = {
	args: {
		reviews: [
			{ owner: "example", repo: "trellis", number: 42, state: "open", askedForReview: false, locallyApproved: false },
			{ owner: "example", repo: "trellis", number: 43, state: "open", askedForReview: true, locallyApproved: true },
			{ owner: "example", repo: "trellis", number: 44, state: "merged", askedForReview: true, locallyApproved: true },
			{ owner: "example", repo: "trellis", number: 45, state: "closed", askedForReview: false, locallyApproved: false },
		],
	},
};
export const Overflow: Story = {
	args: {
		reviews: Array.from({ length: 10 }, (_, index) => ({
			owner: "example",
			repo: "trellis",
			number: 42 + index,
			state: "open",
			askedForReview: true,
			locallyApproved: index % 2 === 0,
		})),
	},
};
