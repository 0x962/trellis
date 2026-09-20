import { type SteCheckResult, steCheck } from "@trellis/api";

export type SummaryField = "headline" | "why" | "watch";
export type SummaryCheck = { field: SummaryField; result: SteCheckResult };
export type SummaryWarning = { field: SummaryField; message: string };

export const summaryChecks = (summary: { headline: string; why: string; watch: string }): SummaryCheck[] => [
	{ field: "headline", result: steCheck(summary.headline, { headline: true }) },
	{ field: "why", result: steCheck(summary.why, { headline: false }) },
	{ field: "watch", result: steCheck(summary.watch, { headline: false }) },
];

const issueText = (field: SummaryField, message: string): string => {
	if (message.startsWith(`${field} `)) return message;
	return `${field}, ${message.replace(/^sentence (\d+) /, "sentence $1, ")}`;
};

export const refusalText = (checks: SummaryCheck[]): string => {
	const refusals = checks.flatMap(({ field, result }) =>
		result.refusals.map((message) => `refused  ${issueText(field, message)}`),
	);
	const warnings = checks.flatMap(({ field, result }) =>
		result.warnings.map((message) => `warn     ${issueText(field, message)}`),
	);
	return `${[...refusals, ...warnings].join("\n")}\n`;
};

export const warningText = (warnings: SummaryWarning[]): string =>
	warnings.map(({ field, message }) => `warn     ${issueText(field, message)}\n`).join("");
