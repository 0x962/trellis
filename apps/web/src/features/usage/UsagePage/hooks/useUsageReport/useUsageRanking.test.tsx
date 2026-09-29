import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UsageRankingInput, UsageReport } from "@trellis/api";
import { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "test-renderer";
import { computeUsageReport } from "../../../../../../../server/src/services/usage/aggregate.ts";
import { rankingPage } from "../../../../../../../server/src/services/usage/ranking/rankingPage.ts";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { UsageGroups } from "../../components/UsageGroups";
import { UsageSessions } from "../../components/UsageSessions";
import { useUsageRanking } from "./useUsageRanking";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createReport() {
	const now = new Date("2026-09-29T12:00:00Z");
	return computeUsageReport({
		entries: Array.from({ length: 241 }, (_, index) => ({
			harness: "codex" as const,
			model: "gpt-5",
			sessionId: `session-${index}`,
			timestampMs: now.getTime(),
			cwd: null,
			uncachedInput: 241 - index,
			cachedInput: 0,
			cacheWrite5m: 0,
			cacheWrite1h: 0,
			output: 0,
			reasoningOutput: 0,
			accounts: [`account-${index}`],
			costUsd: 241 - index,
		})),
		sessionLabels: new Map(),
		scannedFiles: 241,
		runs: [],
		projects: [],
		sessionAccounts: new Map(),
		days: 7,
		cutoffMs: now.getTime() - 1,
		now,
	});
}

test("page actions reach lower ranks and a selected row survives group pages", async () => {
	const report = createReport();
	const requests: UsageRankingInput[] = [];
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const app = {
		queryClient,
		orpc: {
			usage: {
				ranking: {
					queryOptions: ({ input }: { input: UsageRankingInput }) => ({
						queryKey: ["ranking", input],
						queryFn: async () => {
							requests.push(input);
							return rankingPage(report, input);
						},
					}),
				},
			},
		},
	} as unknown as AppContext;
	let data: ReturnType<typeof useUsageRanking>;
	const Probe = ({ row, metric = "usd" }: { row: string | null; metric?: "usd" | "tokens" }) => {
		data = useUsageRanking(report, "account", metric, row, null, () => {});
		return null;
	};
	const renderer = createRoot();
	const render = (row: string | null, metric: "usd" | "tokens" = "usd") =>
		renderer.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<Probe row={row} metric={metric} />
				</AppProvider>
			</QueryClientProvider>,
		);
	const settle = async () => {
		for (let n = 0; n < 100 && (data!.isFetching || !data!.data); n++)
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
			});
		expect(data!.isSuccess).toBe(true);
	};
	await act(async () => render(null));
	await settle();
	const firstPage = data!.data!;
	const groupHtml = renderToStaticMarkup(
		<UsageGroups
			group="account"
			rows={firstPage.groups}
			metric="usd"
			total={report.totals.usd}
			maxValue={firstPage.maxValue}
			count={firstPage.groupTotal}
			start={0}
			pages={null}
			days={[]}
			selectedRow={null}
			onSelectRow={() => {}}
		/>,
	);
	expect(groupHtml.match(/<li /g)).toHaveLength(8);
	const sessionHtml = renderToStaticMarkup(
		<UsageSessions
			sessions={firstPage.sessions}
			metric="usd"
			groupLabel="account"
			filtered={null}
			total={firstPage.sessionTotal}
			pages={null}
		/>,
	);
	expect(sessionHtml.match(/<tr /g)).toHaveLength(11);
	for (let page = 0; page < 24; page++) {
		await act(async () => data!.changeSessionPage(1));
		await settle();
	}
	expect(data!.data?.sessions.map((item) => item.sessionId)).toEqual(["session-240"]);
	await act(async () => render("account:account-240"));
	await settle();
	expect(data!.data?.sessionStart).toBe(0);
	expect(data!.data?.sessionTotal).toBe(1);
	for (let page = 0; page < 30; page++) {
		await act(async () => data!.changeGroupPage(1));
		await settle();
	}
	expect(data!.data?.groups.map((item) => item.key)).toEqual(["account:account-240"]);
	expect(data!.data?.selected?.key).toBe("account:account-240");
	expect(data!.data?.sessions[0]?.sessionId).toBe("session-240");
	await act(async () => data!.changeGroupPage(-1));
	await settle();
	expect(data!.data?.groups).toHaveLength(8);
	expect(data!.data?.selected?.key).toBe("account:account-240");
	await act(async () => render(null, "tokens"));
	await settle();
	expect(data!.data?.groupStart).toBe(0);
	expect(data!.data?.sessionStart).toBe(0);
	await act(async () => render(null, "usd"));
	await settle();
	expect(data!.data?.groupStart).toBe(0);
	expect(requests.some((request) => request.groupPage === 30)).toBe(true);
	expect(requests.some((request) => request.sessionPage === 24)).toBe(true);
	await act(async () => renderer.unmount());
	queryClient.clear();
});

test.each(["reopened URL", "refreshed report"])("clears a missing group from %s", async (scenario) => {
	const initial = createReport();
	const next = createReport();
	next.computedAt = "2026-09-29T13:00:00.000Z";
	next.rankings.usd.groups.account = next.rankings.usd.groups.account.filter((row) => row.key !== "account:account-240");
	next.rankings.usd.sessions = next.rankings.usd.sessions.filter((session) => session.sessionId !== "session-240");
	const reports = new Map([initial, next].map((report) => [report.computedAt, report]));
	const requests: UsageRankingInput[] = [];
	let releaseResponse!: () => void;
	const responseGate = new Promise<void>((resolve) => {
		releaseResponse = resolve;
	});
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const app = {
		queryClient,
		orpc: {
			usage: {
				ranking: {
					queryOptions: ({ input }: { input: UsageRankingInput }) => ({
						queryKey: ["ranking", input],
						queryFn: async () => {
							requests.push(input);
							if (input.computedAt === next.computedAt) await responseGate;
							return rankingPage(reports.get(input.computedAt)!, input);
						},
					}),
				},
			},
		},
	} as unknown as AppContext;
	let data: ReturnType<typeof useUsageRanking>;
	let selected: string | null = "account:account-240";
	const Probe = ({ report }: { report: UsageReport }) => {
		const [row, setRow] = useState<string | null>("account:account-240");
		selected = row;
		data = useUsageRanking(report, "account", "usd", row, "2026-09-29", () => setRow(null));
		return null;
	};
	const renderer = createRoot();
	const render = (report: UsageReport) =>
		renderer.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<Probe report={report} />
				</AppProvider>
			</QueryClientProvider>,
		);
	const settle = async () => {
		for (let n = 0; n < 100 && (data!.isFetching || !data!.data); n++) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
			});
		}
		expect(data!.isSuccess).toBe(true);
	};
	if (scenario === "refreshed report") {
		await act(async () => render(initial));
		await settle();
		expect(selected).toBe("account:account-240");
		expect(data!.data?.sessionTotal).toBe(1);
	}
	await act(async () => render(next));
	expect(data!.isPending).toBe(true);
	expect(selected).toBe("account:account-240");
	await act(async () => releaseResponse());
	await settle();
	expect(selected).toBeNull();
	expect(data!.data?.selected).toBeNull();
	expect(data!.data?.sessionTotal).toBe(240);
	expect(data!.data?.sessions).toHaveLength(10);
	expect(requests.at(-1)).toMatchObject({
		computedAt: next.computedAt,
		row: undefined,
		day: "2026-09-29",
		sessionPage: 0,
	});
	await act(async () => renderer.unmount());
	queryClient.clear();
});
