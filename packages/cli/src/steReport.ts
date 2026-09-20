import { type SteCheckResult, steCheck } from "@trellis/api";

type SteReport = { field?: string; result: SteCheckResult };
type SteWarning = { field?: string; message: string };
type SteWarningSource = SteReport | SteWarning;

export const steReport = (text: string, options: { headline: boolean }, field?: string): SteReport => ({
	field,
	result: steCheck(text, options),
});

const fieldMessage = (field: string | undefined, message: string): string => {
	if (field === undefined || message.startsWith(`${field} `)) return message;
	return `${field}, ${message.replace(/^sentence (\d+) /, "sentence $1, ")}`;
};

export const refusalText = (reports: SteReport[]): string => {
	const refusals = reports.flatMap(({ field, result }) =>
		result.refusals.map((message) => `refused  ${fieldMessage(field, message)}`),
	);
	return refusals.length === 0 ? "" : `${refusals.join("\n")}\n`;
};

export const warningText = (sources: SteWarningSource[]): string =>
	sources
		.flatMap((source) =>
			"result" in source ? source.result.warnings.map((message) => ({ field: source.field, message })) : [source],
		)
		.map(({ field, message }) => `warn     ${fieldMessage(field, message)}\n`)
		.join("");
