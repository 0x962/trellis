import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { UsagePage } from "../../features/usage/UsagePage";
import { Route } from "../../routes/usage";
import { failure, pending } from "./fixtures/project";
import { usageMergedWork, usageResponses } from "./fixtures/usage";
import { emptyMergedWork } from "./fixtures/usageMergedWork";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Usage",
	component: UsagePage,
	parameters: {
		layout: "fullscreen",
		trellis: { route: Route, routePath: "/usage", path: "/usage", loadRoute: false, responses: usageResponses },
	},
} satisfies Meta<typeof UsagePage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SevenDays: Story = {
	parameters: { trellis: { path: "/usage?days=7" } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Sep 24, 2026 to Sep 30, 2026")).toBeVisible();
		await waitFor(() => expect(canvasElement.querySelectorAll("[data-chart-tick]")).toHaveLength(12));
	},
};

export const NinetyDays: Story = {
	parameters: { trellis: { path: "/usage?days=90" } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Jul 3, 2026 to Sep 30, 2026")).toBeVisible();
		await waitFor(() => expect(canvasElement.querySelectorAll("[data-chart-tick]")).toHaveLength(21));
		await expect(canvasElement.querySelector('[data-chart-tick="2026-07-03"]')).toHaveTextContent("Jul 3");
		await expect(canvasElement.querySelector('[data-chart-tick="2026-09-30"]')).toHaveTextContent("Sep 30");
	},
};

export const MergedWorkComparison: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const region = await canvas.findByRole("region", { name: "Merged work" });
		const work = within(region);
		const prs = await work.findByRole("button", { name: /^PRs merged per day\./ });
		const lines = work.getByRole("button", { name: /^Lines changed per day\./ });
		prs.focus();
		await userEvent.keyboard("{End}{Enter}");
		await expect(prs).toHaveAttribute("aria-pressed", "true");
		await expect(region.querySelectorAll('[data-selected-day="2026-09-30"]')).toHaveLength(2);
		await userEvent.tab();
		await expect(lines).toHaveFocus();
		await expect(lines).toHaveAttribute("data-day", "2026-09-30");
		await userEvent.keyboard("{Home}{ }");
		await expect(region.querySelectorAll('[data-selected-day="2026-09-01"]')).toHaveLength(2);
		await expect(work.getByText("+2,800")).toBeVisible();
		await userEvent.keyboard("{Escape}");
		await expect(lines).toHaveFocus();
		await expect(work.queryByRole("button", { name: "Clear comparison date" })).not.toBeInTheDocument();
		await expect(region.querySelector("[data-selected-day]")).toBeNull();
		await userEvent.keyboard("{ArrowRight}{Enter}");
		await userEvent.click(work.getByRole("button", { name: "Clear comparison date" }));
		await expect(region.querySelector("[data-selected-day]")).toBeNull();
	},
};

export const EmptyMergedWork: Story = {
	parameters: { trellis: { responses: { "usage.mergedWork": emptyMergedWork } } },
	play: async ({ canvasElement }) => {
		const work = within(await within(canvasElement).findByRole("region", { name: "Merged work" }));
		await expect(await work.findByText("No linked PRs merged in this range.")).toBeVisible();
		await expect(work.queryByRole("img")).not.toBeInTheDocument();
		await expect(work.getByText("+0")).toBeVisible();
	},
};

export const MergedWorkLoading: Story = {
	parameters: { trellis: { responses: { "usage.mergedWork": pending } } },
};

export const IncompleteMergedWork: Story = {
	parameters: {
		trellis: {
			responses: {
				"usage.mergedWork": {
					...usageMergedWork,
					totals: { prs: 28, additions: 2800, deletions: 0, missingAdditions: 1, missingDeletions: 28 },
					buckets: usageMergedWork.buckets.map((bucket, index) => ({
						...bucket,
						deletions: 0,
						missingAdditions: index === usageMergedWork.buckets.length - 1 ? 1 : 0,
						missingDeletions: bucket.prs,
					})),
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const work = within(await within(canvasElement).findByRole("region", { name: "Merged work" }));
		await expect(await work.findByText("≥ +2,800")).toBeVisible();
		await expect(work.getByText("Not available")).toBeVisible();
		await expect(work.getByText("1 PR lacks this value")).toBeVisible();
		const chart = work.getByRole("button", { name: /^Lines changed per day/ });
		chart.focus();
		await userEvent.keyboard("{End}{Enter}");
		await expect(work.getByText("Sep 30. Added: unavailable for 1 PR. Deleted: unavailable for 7 PRs.")).toBeVisible();
		await expect(work.getByText("Not available")).toBeVisible();
	},
};

export const MergedWorkError: Story = {
	parameters: { trellis: { responses: { "usage.mergedWork": failure } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "Could not read merged work" })).toBeVisible();
		await expect(canvas.getByRole("heading", { name: "Breakdown by model" })).toBeVisible();
	},
};
