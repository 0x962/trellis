import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { UsagePage } from "../../features/usage/UsagePage";
import { Route } from "../../routes/usage";
import { failure, pending } from "./fixtures/project";
import { emptyUsageRanking, emptyUsageReport, systemUsage, usageResponses } from "./fixtures/usage";
import { attributionRanking, attributionReport } from "./fixtures/usageAttribution";
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

export const Agent: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "Breakdown by model" })).toBeVisible();
		await expect(await canvas.findByRole("heading", { name: "Breakdown by harness" })).toBeVisible();
		const work = within(await canvas.findByRole("region", { name: "Merged work" }));
		await expect(await work.findByText("+2,800")).toBeVisible();
		await expect(work.getByText("−1,120")).toBeVisible();
		await expect(canvas.queryByRole("heading", { name: /Sessions by/ })).not.toBeInTheDocument();
		const models = within(canvas.getByRole("region", { name: "Breakdown by model" }));
		await userEvent.click(models.getByRole("button"));
		await expect(await canvas.findByRole("button", { name: "Clear usage filter" })).toBeVisible();
		await expect(work.getByText("+2,800")).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Clear usage filter" }));
		const explanation = canvas.getByRole("button", { name: "How to read these charts" });
		await expect(explanation).toHaveAttribute("aria-expanded", "false");
		await userEvent.click(explanation);
		await expect(explanation).toHaveAttribute("aria-expanded", "true");
		await expect(canvas.getByText(/Line totals include all files/)).toBeVisible();
		await userEvent.click(explanation);
		await expect(canvas.getByText(/Line totals include all files/)).not.toBeVisible();
	},
};
export const TokensByModel: Story = { parameters: { trellis: { path: "/usage?metric=tokens&group=model" } } };
export const SelectedDayAndModel: Story = {
	parameters: { trellis: { path: "/usage?group=model&row=anthropic%2Fclaude-sonnet-5.5&day=2026-09-30" } },
};
export const CostAttribution: Story = {
	parameters: { trellis: { responses: { "usage.report": attributionReport, "usage.ranking": attributionRanking } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: /Matching sessions/ })).toBeVisible();
		const sessions = within(canvas.getByRole("region", { name: "Matching sessions" }));
		await userEvent.click(sessions.getByRole("button", { name: "Next sessions page" }));
		await expect(await sessions.findByText("11–20 of 23")).toBeVisible();
		await userEvent.click(sessions.getByRole("button", { name: "Next sessions page" }));
		await expect(await sessions.findByText("21–23 of 23")).toBeVisible();
		await userEvent.click(sessions.getByRole("button", { name: /Review session 1 Claude/ }));
		const dialog = within(await within(document.body).findByRole("dialog", { name: "Session usage" }));
		await expect(dialog.getByText("$0", { exact: true })).toBeVisible();
		await expect(dialog.getByText("DEMO-40", { exact: true })).toBeVisible();
		await userEvent.keyboard("{Escape}");
		await expect(sessions.getByRole("button", { name: /Review session 1 Claude/ })).toHaveFocus();
		await userEvent.click(canvas.getByRole("button", { name: "Cost details" }));
		await expect(canvas.getByText("Cache savings", { exact: true })).toBeVisible();
		for (const [option, title] of [
			["Ticket", "ticket"],
			["Agent", "agent"],
			["Project", "project"],
			["Run kind", "run kind"],
			["Account", "account"],
			["Harness", "harness"],
			["Model", "model"],
		]) {
			await userEvent.click(canvas.getByRole("combobox", { name: "Break down usage by" }));
			await userEvent.click(await within(document.body).findByRole("option", { name: option }));
			await expect(await canvas.findByRole("heading", { name: `Breakdown by ${title}` })).toBeVisible();
		}
	},
};
export const NoMatchingSessions: Story = {
	parameters: {
		trellis: {
			path: "/usage?day=2026-09-01",
			responses: { "usage.report": attributionReport, "usage.ranking": attributionRanking },
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "No matching sessions" })).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Clear usage date" }));
		await expect(await canvas.findByRole("list", { name: "Session usage" })).toBeVisible();
	},
};
export const Empty: Story = {
	parameters: {
		trellis: { responses: { "usage.report": emptyUsageReport, "usage.ranking": emptyUsageRanking } },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "No usage in the last 30 days" })).toBeVisible();
		const work = within(await canvas.findByRole("region", { name: "Merged work" }));
		await expect(await work.findByText("+2,800")).toBeVisible();
		const accounts = within(await canvas.findByRole("region", { name: "Accounts" }));
		await expect(await accounts.findByText("$0", { exact: true })).toBeVisible();
		await expect(accounts.queryByText("$35.00", { exact: true })).not.toBeInTheDocument();
	},
};
export const IncompleteMergedWork: Story = {
	parameters: {
		trellis: {
			responses: {
				"usage.mergedWork": {
					...usageResponses["usage.mergedWork"],
					totals: { prs: 28, additions: 2800, deletions: 0, missingAdditions: 1, missingDeletions: 28 },
					buckets: usageResponses["usage.mergedWork"].buckets.map((bucket, index) => ({
						...bucket,
						deletions: 0,
						missingAdditions: index === 0 ? 1 : 0,
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
export const Loading: Story = { parameters: { trellis: { responses: { "usage.report": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "usage.report": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const System: Story = {
	parameters: { trellis: { path: "/usage?tab=system" } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("region", { name: "Right now" })).toBeVisible();
		await expect(await canvas.findByRole("heading", { name: "CPU history" })).toBeVisible();
		await expect(await canvas.findByRole("heading", { name: "Memory history" })).toBeVisible();
		await expect(canvas.queryByRole("heading", { name: "Processes" })).not.toBeInTheDocument();
	},
};
export const SystemLoading: Story = {
	parameters: { trellis: { path: "/usage?tab=system", responses: { "system.usage": pending } } },
};
export const SystemError: Story = {
	parameters: { trellis: { path: "/usage?tab=system", responses: { "system.usage": failure } } },
};
export const MemoryPressure: Story = {
	parameters: {
		trellis: {
			path: "/usage?tab=system",
			responses: { "system.usage": { ...systemUsage, memoryPercent: 96, memoryLevel: 4 } },
		},
	},
};
export const SystemNarrow: Story = {
	...System,
	globals: { viewport: { value: "phone", isRotated: false } },
};
