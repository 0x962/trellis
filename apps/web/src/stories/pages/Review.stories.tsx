import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ReviewPage } from "../../features/reviews/ReviewPage/ReviewPage";
import { flowHistoryResponses } from "./fixtures/flowHistory";
import { failure, pending, ticket } from "./fixtures/project";
import { pullRequest, reviewOverview, reviewResponses, reviewStatus, reviewThread, revision } from "./fixtures/review";
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

export const CancelComment: Story = {
	play: async (context) => {
		await OpenFinding.play!(context);
		const canvas = within(context.canvasElement);
		const trigger = () =>
			within(
				context.canvasElement.querySelector<HTMLElement>('.review-diff-line[data-side="new"][data-line-number="2"]')!,
			).getByRole("button", { name: "Add line comment" });
		trigger().focus();
		await userEvent.keyboard("{Enter}");
		const form = await canvas.findByRole("form", { name: "Add review comment" });
		const cancel = within(form).getByRole("button", { name: "Cancel" });
		await waitFor(() => expect(within(form).getByRole("textbox", { name: "Comment" })).toHaveFocus());
		for (let step = 0; document.activeElement !== cancel && step < 8; step++) await userEvent.tab();
		await expect(cancel).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(trigger()).toHaveFocus());
		await expect(canvas.queryByRole("form", { name: "Add review comment" })).not.toBeInTheDocument();
	},
};
const denseRevision = {
	...revision,
	patch:
		"diff --git a/src/title.ts b/src/title.ts\n--- a/src/title.ts\n+++ b/src/title.ts\n@@ -1,300 +1,300 @@\n" +
		Array.from({ length: 300 }, (_, i) => ` line ${i + 1}\n`).join(""),
};
export const OutdatedFinding: Story = {
	parameters: {
		trellis: {
			responses: {
				"reviews.revision": denseRevision,
				"reviews.refresh": denseRevision,
				"reviews.list": {
					items: [{ ...reviewThread, revisionId: "earlier-revision", anchorLines: null }],
					total: 1,
					open: 1,
				},
			},
		},
	},
};
export const RepeatOutdatedFinding: Story = {
	...OutdatedFinding,
	play: async (context) => {
		const canvas = within(context.canvasElement);
		const open = async () => {
			await userEvent.click(await canvas.findByRole("button", { name: /Keep the title readable/ }));
			await waitFor(() => expect(canvas.getByRole("article", { name: "Thread by Storybook" })).toHaveFocus());
		};
		await open();
		const code = context.canvasElement.querySelector<HTMLElement>(".review-code")!;
		code.scrollTop = code.scrollHeight;
		code.dispatchEvent(new Event("scroll"));
		await waitFor(() => expect(canvas.queryByRole("article", { name: "Thread by Storybook" })).not.toBeInTheDocument());
		await userEvent.click(canvas.getByRole("tab", { name: "Overview" }));
		await open();
		await waitFor(() => expect(code.scrollTop).toBeLessThan(100));
	},
};
export const OpenFinding: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const finding = await canvas.findByRole("button", {
			name: /Keep the title readable when the value contains only spaces/,
		});
		finding.focus();
		await userEvent.keyboard("{Enter}");
		await expect(await canvas.findByRole("tab", { name: "Diff", selected: true })).toBeVisible();
		await expect(await canvas.findByRole("article", { name: "Thread by Storybook" })).toBeVisible();
		await waitFor(() => expect(canvas.getByRole("article", { name: "Thread by Storybook" })).toHaveFocus());
		await expect(await canvas.findByRole("textbox", { name: "Reply" })).toBeVisible();
	},
};
export const OpenFindingNarrow: Story = {
	...OpenFinding,
	globals: { viewport: { value: "narrow", isRotated: false } },
};
export const OverviewError: Story = {
	parameters: { trellis: { responses: { "reviews.overview": failure } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("alert")).toHaveTextContent("The overview did not load");
		await expect(canvas.queryByText("The overview is loading.")).not.toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Retry overview" })).toBeVisible();
	},
};
let repliedThread = reviewThread;
export const ReplySaved: Story = {
	beforeEach: () => {
		repliedThread = structuredClone(reviewThread);
	},
	parameters: {
		trellis: {
			responses: {
				"reviews.list": () => ({ items: [repliedThread], total: 1, open: 1 }),
				"reviews.reply": ({ body }: { body: string }) => {
					repliedThread = {
						...repliedThread,
						replies: [...repliedThread.replies, { ...reviewThread, id: "reply-303", body }],
					};
				},
			},
		},
	},
	play: async (context) => {
		await OpenFinding.play!(context);
		const canvas = within(context.canvasElement);
		await userEvent.type(canvas.getByRole("textbox", { name: "Reply" }), "The reply stays with this line.");
		await userEvent.click(canvas.getByRole("button", { name: "Post reply" }));
		await expect(await canvas.findByText("The reply stays with this line.")).toBeVisible();
		await expect(canvas.getByRole("textbox", { name: "Reply" })).toHaveValue("");
	},
};
export const ReplyFailed: Story = {
	parameters: {
		trellis: {
			responses: {
				"reviews.reply": () => {
					throw new Error("The reply did not save. Try again.");
				},
			},
		},
	},
	play: async (context) => {
		await OpenFinding.play!(context);
		const canvas = within(context.canvasElement);
		await userEvent.type(canvas.getByRole("textbox", { name: "Reply" }), "Keep this reply draft.");
		await userEvent.click(canvas.getByRole("button", { name: "Post reply" }));
		await expect(await canvas.findByRole("alert")).toHaveTextContent("The reply did not save. Try again.");
		await expect(canvas.getByRole("textbox", { name: "Reply" })).toHaveValue("Keep this reply draft.");
	},
};
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
