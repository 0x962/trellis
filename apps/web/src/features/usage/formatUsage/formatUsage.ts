import type { UsageGroupBy, UsageGroupRow, UsageHarness, UsageMetric } from "@trellis/api";
import { type ChartTone, type ModelProvider, otherTone, rankedTones } from "@trellis/ui";

// "$19,211", "$46.20", "$0.85", "<$0.01". Whole dollars from $100 up.
export function formatUsd(usd: number): string {
	if (usd === 0) return "$0";
	if (usd > 0 && usd < 0.005) return "<$0.01";
	return usd.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: usd >= 100 ? 0 : 2,
		minimumFractionDigits: usd >= 100 ? 0 : 2,
	});
}

const TOKEN_UNITS = [
	{ limit: 1e12, suffix: "T", digits: 2 },
	{ limit: 1e9, suffix: "B", digits: 1 },
	{ limit: 1e6, suffix: "M", digits: 1 },
	{ limit: 1e3, suffix: "K", digits: 0 },
] as const;

// "1.24T", "13.9B", "4.2M", "850K", "312".
export function formatTokens(tokens: number): string {
	for (const unit of TOKEN_UNITS) {
		if (tokens >= unit.limit) return `${(tokens / unit.limit).toFixed(unit.digits)}${unit.suffix}`;
	}
	return Math.round(tokens).toLocaleString("en-US");
}

export const formatMetric = (metric: UsageMetric, value: number) =>
	metric === "usd" ? formatUsd(value) : formatTokens(value);

// "Sep 12" from a `YYYY-MM-DD` day key. The key is a local calendar day,
// so it is parsed as one and never shifted by the timezone.
export function formatDayLabel(day: string): string {
	const [year, month, date] = day.split("-").map(Number);
	if (!year || !month || !date) return day;
	return new Date(year, month - 1, date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The local calendar day of an ISO time, in the `YYYY-MM-DD` form of the
// report day keys.
export function localDayKey(iso: string): string {
	const date = new Date(iso);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

// "42%" of `total`, or "" when there is no total.
export const formatShare = (value: number, total: number) => (total > 0 ? `${Math.round((100 * value) / total)}%` : "");

export const harnessLabel: Record<UsageHarness, string> = {
	claude: "Claude Code",
	codex: "Codex",
	opencode: "OpenCode",
	pi: "Pi",
	muse: "Muse",
};

// The company behind a harness that serves one provider. Pi and OpenCode
// route to many, so a row of theirs takes its provider from the model.
export const harnessProvider: Partial<Record<UsageHarness, ModelProvider>> = {
	claude: "anthropic",
	codex: "openai",
	muse: "meta",
};

// The company behind a model id, from the vendor prefix or the model name.
export function modelProvider(model: string): ModelProvider | null {
	const id = model.toLowerCase();
	if (id.startsWith("anthropic/") || id.includes("claude")) return "anthropic";
	if (id.startsWith("openai/") || id.includes("gpt") || id.includes("codex")) return "openai";
	if (id.startsWith("meta/") || id.includes("muse") || id.includes("llama")) return "meta";
	if (id.startsWith("google/") || id.includes("gemini")) return "google";
	return null;
}

// Each harness keeps one tone on every chart, so Claude Code is purple on
// the harness split, on the model list, and on the quota cards.
export const harnessTone: Record<UsageHarness, ChartTone> = {
	claude: "agent",
	codex: "fg",
	opencode: "success",
	pi: "warning",
	muse: "danger",
};

// The tone of a breakdown row. Under the harness grouping a row keeps its
// harness tone. Under every other grouping a row takes the tone of its
// rank, and every row past the ranked tones takes the quiet tone of
// "everything else".
export const rowTone = (row: UsageGroupRow, rank: number, group: UsageGroupBy): ChartTone =>
	group === "harness" && row.harness ? harnessTone[row.harness] : (rankedTones[rank] ?? otherTone);

// How many rows a chart draws as their own series before the rest fold
// into one "Other" series.
export const CHART_TOP_ROWS = 5;
