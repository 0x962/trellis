import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullRequestSheet } from "../../features/shell/PageSheetHost/components/PullRequestSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { failure, pending, ticket } from "./fixtures/project";
import { pullRequest, reviewResponses } from "./fixtures/review";

const meta = {
	title: "Pages/Review sheet",
	component: PullRequestSheet,
	beforeEach: () => {
		pageSheetActions.openPullRequest(pullRequest.url);
		pageSheetActions.setReviewTab("overview");
	},
	parameters: { layout: "fullscreen", trellis: { path: "/search", responses: reviewResponses } },
} satisfies Meta<typeof PullRequestSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const FromTicket: Story = { args: { ticket: ticket.identifier } };
export const Diff: Story = {
	beforeEach: () => {
		pageSheetActions.setReviewTab("diff");
	},
};
export const Loading: Story = {
	parameters: {
		trellis: {
			responses: { "reviews.overview": pending, "reviews.revision": pending, "reviews.status": pending },
		},
	},
};
export const RequestError: Story = {
	parameters: {
		trellis: {
			responses: { "reviews.overview": failure, "reviews.status": failure, "reviews.refresh": failure },
		},
	},
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
