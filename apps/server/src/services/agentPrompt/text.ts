import type { EpicCounts } from "@trellis/api";

export const cell = (value: unknown) =>
	String(value ?? "None")
		.replaceAll("|", "\\|")
		.replace(/\r?\n/g, "<br>");
export const row = (...cells: unknown[]) => `| ${cells.map(cell).join(" | ")} |`;
export const tableRows = (data: unknown[][], width: number) =>
	(data.length === 0 ? [Array.from({ length: width }, () => "None")] : data).map((cells) => row(...cells)).join("\n");
export const progress = (counts: EpicCounts) =>
	`${counts.done} done, ${counts.canceled} canceled, ${counts.total} total`;
export const record = (value: unknown) => {
	const text = JSON.stringify(value, null, 2);
	const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((match) => match.length));
	const fence = "`".repeat(longest + 1);
	return `${fence}json\n${text}\n${fence}`;
};
