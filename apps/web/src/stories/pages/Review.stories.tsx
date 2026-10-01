import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { ReviewPage } from "../../features/reviews/ReviewPage/ReviewPage";
import { flowHistoryResponses } from "./fixtures/flowHistory";
import { failure, pending } from "./fixtures/project";
import { pullRequest, reviewOverview, reviewResponses, reviewStatus } from "./fixtures/review";

const meta = {
	title: "Pages/Review",
	component: ReviewPage,
	args: { pr: pullRequest.url, tab: "overview", onTabChange: () => {}, syncHash: false },
	render: function Render(args) {
		const [, updateArgs] = useArgs();
		return <ReviewPage {...args} onTabChange={(tab) => updateArgs({ tab })} />;
	},
	parameters: { layout: "fullscreen", trellis: { path: "/reviews/example/trellis/42", responses: reviewResponses } },
} satisfies Meta<typeof ReviewPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Checks: Story = { args: { tab: "checks" } };
export const Diff: Story = { args: { tab: "diff" } };
export const Flows: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: flowHistoryResponses } },
};
export const FlowsWithoutTicket: Story = { args: { tab: "flows" } };
export const FlowsEmpty: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: { ...flowHistoryResponses, "flowDocumentsV1.list": [] } } },
};
export const FlowsLoading: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: { ...flowHistoryResponses, "flowDocumentsV1.list": pending } } },
};
export const FlowsError: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: { ...flowHistoryResponses, "flowDocumentsV1.list": failure } } },
};
export const FlowsNarrow: Story = { ...Flows, globals: { viewport: { value: "phone", isRotated: false } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const EmptyOverview: Story = {
	parameters: {
		trellis: {
			responses: {
				"reviews.overview": { ...reviewOverview, summary: null, evidence: null },
				"reviews.list": { items: [], total: 0, open: 0 },
			},
		},
	},
};
export const Loading: Story = {
	parameters: {
		trellis: {
			responses: {
				"reviews.overview": pending,
				"reviews.revision": pending,
				"reviews.status": pending,
				"reviews.list": pending,
			},
		},
	},
};
export const RequestError: Story = {
	parameters: {
		trellis: { responses: { "reviews.overview": failure, "reviews.status": failure, "reviews.refresh": failure } },
	},
};
export const FailedChecks: Story = {
	args: { tab: "checks" },
	parameters: {
		trellis: {
			responses: {
				"reviews.overview": {
					...reviewOverview,
					pullRequest: {
						...pullRequest,
						ciState: "fail",
						checks: pullRequest.checks.map((check, index) => ({
							...check,
							bucket: index === 0 ? "fail" : "pending",
							endedAt: index === 0 ? check.endedAt : null,
						})),
					},
				},
			},
		},
	},
};
export const MergeConflict: Story = {
	parameters: {
		trellis: {
			responses: { "reviews.status": { ...reviewStatus, mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" } },
		},
	},
};
export const Queued: Story = {
	parameters: {
		trellis: {
			responses: {
				"reviews.overview": { ...reviewOverview, pullRequest: { ...pullRequest, isQueued: true } },
				"reviews.status": { ...reviewStatus, isQueued: true },
				"reviews.metadata": { mergeQueueEntry: { position: 3 }, reviews: [], commits: [], files: [] },
			},
		},
	},
};
