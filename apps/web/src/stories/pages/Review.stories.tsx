import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ReviewPage } from "../../features/reviews/ReviewPage/ReviewPage";
import type { PreparedStory } from "../support/prepareStory/prepareStory";
import {
	flowHistoryResponses,
	flowTaskRun,
	replacementAttemptId,
	replacementFlowTaskRun,
	retainedReviewOutput,
} from "./fixtures/flowHistory";
import { flowHistoryJourney } from "./fixtures/flowHistoryJourney";
import { failure, pending, ticket } from "./fixtures/project";
import { pullRequest, reviewOverview, reviewResponses, reviewStatus } from "./fixtures/review";
import { prepareSessionTerminal } from "./fixtures/sessionTerminal";
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
const journey = flowHistoryJourney(true);
const prepareFlowJourney = async () => {
	journey.reset();
	const disposeOriginal = await prepareSessionTerminal(flowTaskRun, "completed", {
		history: () => retainedReviewOutput,
	})();
	const disposeReplacement = await prepareSessionTerminal(replacementFlowTaskRun, "completed", {
		history: () => `Replacement attempt. ${retainedReviewOutput}`,
	})();
	return () => {
		disposeOriginal();
		disposeReplacement();
	};
};

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
	parameters: { trellis: { responses: journey.responses } },
	beforeEach: prepareFlowJourney,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("button", { name: "Decide Approve the result" })).toBeVisible();
		await expect(canvas.queryByText("Not started")).not.toBeInTheDocument();
		await expect(await canvas.findByText("Yes", { exact: true })).toBeVisible();
	},
};
export const FlowsJourney: Story = {
	...Flows,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(await canvas.findByRole("button", { name: "Actions for Review the interface" }));
		await userEvent.click(await page.findByRole("menuitem", { name: "Open terminal" }));
		await expect(await page.findByRole("dialog", { name: "Review the interface terminal" })).toBeVisible();
		await waitFor(
			() =>
				expect(
					canvasElement.ownerDocument.querySelector('[role="dialog"] .xterm-accessibility-tree'),
				).toHaveTextContent(retainedReviewOutput),
			{ timeout: 5000 },
		);
		await userEvent.click(await page.findByRole("button", { name: "Close terminal" }));
		await userEvent.click(await canvas.findByRole("button", { name: "Decide Approve the result" }));
		await userEvent.type(
			await page.findByRole("textbox", { name: "Decision notes" }),
			"Approve the retained evidence.",
		);
		await userEvent.click(await page.findByRole("button", { name: "Approve step" }));
		await expect(await page.findByRole("heading", { name: "The decision request did not complete" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Decision notes" })).toHaveValue("Approve the retained evidence.");
		await userEvent.click(await page.findByRole("button", { name: "Approve step" }));
		await waitFor(() => expect(page.queryByRole("dialog", { name: "Decide the flow step" })).not.toBeInTheDocument());
		await expect(await canvas.findByText("Succeeded", { exact: true })).toBeVisible();
		await userEvent.click(await canvas.findByRole("button", { name: "Run Interface review again" }));
		await expect(await canvas.findByRole("button", { name: "Cancel this run" })).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Cancel this run" }));
		await userEvent.click(await page.findByRole("button", { name: /^Cancel run$/ }));
		await expect(await canvas.findByText("Canceled", { exact: true })).toBeVisible();
		await userEvent.click(canvas.getAllByText("Output", { exact: true })[0]!);
		await expect(await canvas.findByText(retainedReviewOutput, { exact: true })).toBeVisible();
	},
};
export const FlowsReplacedAttempt: Story = {
	...Flows,
	play: async ({ canvasElement, loaded }) => {
		const canvas = within(canvasElement);
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(await canvas.findByText("Output", { exact: true }));
		await expect(await canvas.findByText(retainedReviewOutput, { exact: true })).toBeVisible();
		journey.replaceAttempt();
		const { app } = loaded.appStory as PreparedStory;
		await app.queryClient.invalidateQueries({ queryKey: app.orpc.flowExecutions.list.key() });
		await app.queryClient.invalidateQueries({ queryKey: app.orpc.agentRuns.key() });
		await expect(canvas.getByText(retainedReviewOutput, { exact: true })).toBeVisible();
		await userEvent.click(canvas.getByText("Result identifiers", { exact: true }));
		await expect(await canvas.findByText(replacementAttemptId, { exact: true })).toBeVisible();
		await expect(await canvas.findByText("storybook-flow-result-1", { exact: true })).toBeVisible();
		await userEvent.click(await canvas.findByRole("button", { name: "Actions for Review the interface" }));
		await userEvent.click(await page.findByRole("menuitem", { name: "Open terminal" }));
		await expect(await page.findByRole("dialog", { name: "Review the interface terminal" })).toBeVisible();
		await waitFor(
			() =>
				expect(
					canvasElement.ownerDocument.querySelector('[role="dialog"] .xterm-accessibility-tree'),
				).toHaveTextContent("Replacement attempt."),
			{ timeout: 5000 },
		);
		await userEvent.click(await page.findByRole("button", { name: "Close terminal" }));
	},
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
