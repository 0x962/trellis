import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, within } from "storybook/test";
import { ReviewPage } from "../../features/reviews/ReviewPage/ReviewPage";
import { flowHistoryResponses } from "./fixtures/flowHistory";
import { failure, pending, ticket } from "./fixtures/project";
import { pullRequest, reviewOverview, reviewResponses, reviewStatus } from "./fixtures/review";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
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
export const SwitchTabs: Story = {
	parameters: { trellis: { responses: flowHistoryResponses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const name of ["Checks", "Flows", "Diff", "Overview"]) {
			await userEvent.click(await canvas.findByRole("tab", { name }));
			await expect(await canvas.findByRole("tab", { name, selected: true })).toBeVisible();
			await expect(await canvas.findByRole("tabpanel", { name })).toBeVisible();
		}
	},
};
export const Checks: Story = { args: { tab: "checks" } };
export const Diff: Story = { args: { tab: "diff" } };
export const Flows: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: flowHistoryResponses } },
};
export const FlowsWithoutTicket: Story = {
	args: { tab: "flows" },
	parameters: {
		trellis: {
			responses: {
				"reviews.overview": { ...reviewOverview, ticket: null },
				"reviews.status": { ...reviewStatus, ticket: null },
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByText("No ticket links this pull request, and a flow runs against a ticket."),
		).toBeVisible();
		await expect(canvas.queryByRole("link", { name: ticket.identifier })).not.toBeInTheDocument();
	},
};
export const FlowsEmpty: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: { ...flowHistoryResponses, "flowExecutions.list": [] } } },
};
export const FlowsLoading: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: { ...flowHistoryResponses, "flowExecutions.list": pending } } },
};
export const FlowsError: Story = {
	args: { tab: "flows" },
	parameters: { trellis: { responses: { ...flowHistoryResponses, "flowExecutions.list": failure } } },
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
