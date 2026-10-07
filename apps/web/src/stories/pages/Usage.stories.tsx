import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { UsagePage } from "../../features/usage/UsagePage";
import { Route } from "../../routes/usage";
import type { PreparedStory } from "../support/prepareStory";
import { failure, pending } from "./fixtures/project";
import {
	emptyUsageRanking,
	emptyUsageReport,
	systemUsage,
	systemUsageAt,
	systemUsageWithMemory,
	usageMergedWork,
	usageResponses,
} from "./fixtures/usage";
import { attributionRanking, attributionReport } from "./fixtures/usageAttribution";
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

export const Agent: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "Breakdown by model" })).toBeVisible();
		await expect(await canvas.findByRole("heading", { name: "Breakdown by harness" })).toBeVisible();
		await expect(await canvas.findByText("Sep 1, 2026 to Sep 30, 2026")).toBeVisible();
		await expect(canvasElement.querySelectorAll("[data-chart-tick]")).toHaveLength(15);
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
export const Loading: Story = { parameters: { trellis: { responses: { "usage.report": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "usage.report": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const System: Story = {
	parameters: { trellis: { path: "/usage?tab=system" } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("region", { name: "Current metrics" })).toBeVisible();
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
			responses: { "system.usage": systemUsageWithMemory(96, 4) },
		},
	},
};
export const SystemNarrow: Story = {
	...System,
	globals: { viewport: { value: "phone", isRotated: false } },
};
export const SystemEmptyHistory: Story = {
	parameters: {
		trellis: { path: "/usage?tab=system", responses: { "system.usage": { ...systemUsage, history: [] } } },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "No recent samples" })).toBeVisible();
		await expect(canvas.getByText("38.0%", { exact: true })).toBeVisible();
		await expect(canvas.queryByRole("img", { name: "Recent CPU usage" })).not.toBeInTheDocument();
	},
};
export const SystemSelectedSample: Story = {
	...System,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const cpu = await canvas.findByRole("button", { name: /^Recent CPU usage\./ });
		await userEvent.click(cpu);
		await expect(cpu).toHaveAttribute("aria-pressed", "true");
		await expect(canvas.getByText(/Selected sample at/)).toBeVisible();
		await expect(
			canvas.getByRole("img", { name: "Recent memory use" }).querySelector("[data-selected-day]"),
		).not.toBeNull();
	},
};
export const SystemMemoryUnavailable: Story = {
	parameters: {
		trellis: { path: "/usage?tab=system", responses: { "system.usage": { ...systemUsage, memoryLevel: null } } },
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("Unavailable", { exact: true })).toBeVisible();
	},
};
export const SystemDenseHistory: Story = {
	parameters: {
		trellis: {
			path: "/usage?tab=system",
			responses: {
				"system.usage": {
					...systemUsage,
					hostname: "synthetic-host-with-a-long-name-for-a-narrow-layout",
					cpuModel: "Synthetic processor with a long descriptive model name",
					history: Array.from({ length: 150 }, (_, index) => ({
						at: new Date(Date.parse(systemUsage.sampledAt) - (149 - index) * 2_000).toISOString(),
						cpuPercent: 8 + (index / 149) * 30,
						memoryPercent: 62,
						memoryLevel: 1 as const,
					})),
				},
			},
		},
	},
};
export const SystemAt320: Story = {
	...SystemDenseHistory,
	globals: { viewport: { value: "narrow", isRotated: false } },
};
export const SystemMemoryAttributionError: Story = {
	parameters: { trellis: { path: "/usage?tab=system", responses: { "system.pressure": failure } } },
};
export const SystemNoMeasuredRuns: Story = {
	parameters: {
		trellis: {
			path: "/usage?tab=system",
			responses: { "system.pressure": { ...usageResponses["system.pressure"], runs: [] } },
		},
	},
};
let systemPollFails = false;
export const SystemPollError: Story = {
	beforeEach: () => {
		systemPollFails = false;
	},
	parameters: {
		trellis: {
			path: "/usage?tab=system",
			responses: {
				"system.usage": () => {
					if (systemPollFails) throw new Error("The synthetic update fails.");
					return systemUsage;
				},
			},
		},
	},
	play: async ({ canvasElement, loaded }) => {
		const canvas = within(canvasElement);
		await canvas.findByRole("heading", { name: "CPU history" });
		systemPollFails = true;
		const { app } = loaded.appStory as PreparedStory;
		await app.queryClient.refetchQueries({ queryKey: app.orpc.system.usage.queryOptions({}).queryKey });
		await expect(await canvas.findByRole("heading", { name: "Could not update system usage" })).toBeVisible();
		await expect(canvas.getByText("Out of date", { exact: true })).toBeVisible();
		await expect(canvas.getByText("38.0%", { exact: true })).toBeVisible();
		await expect(canvas.getByRole("img", { name: "Recent memory use" })).toBeVisible();
	},
};
export const SystemLiveUpdates: Story = {
	parameters: {
		trellis: {
			path: "/usage?tab=system",
			responses: {
				"system.usage": () => systemUsageAt(new Date(Math.floor(Date.now() / 2_000) * 2_000).toISOString()),
			},
		},
	},
};
