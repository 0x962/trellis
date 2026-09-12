import type { CliContext } from "../../context";
import { cell, json, renderTable } from "../../output";
export function emitReview(ctx: CliContext, value: unknown) {
	const rows = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
	if (ctx.format.mode === "json") {
		ctx.out.write(json(value));
		return;
	}
	if (ctx.format.mode === "jsonl") {
		ctx.out.write(rows.map(json).join(""));
		return;
	}
	if (ctx.format.mode === "quiet") {
		ctx.out.write(rows.map((r) => `${r.id ?? r.url}\n`).join(""));
		return;
	}
	if (Array.isArray(value)) {
		ctx.out.write(
			renderTable(
				rows,
				["id", "author", "path", "line", "status", "title", "open"]
					.filter((key) => rows.some((r) => key in r))
					.map((name) => ({ name, value: (row: Record<string, unknown>) => cell(row[name]) })),
			),
		);
	} else {
		for (const [key, field] of Object.entries(rows[0]!))
			ctx.out.write(`${key}: ${typeof field === "object" ? JSON.stringify(field) : String(field)}\n`);
	}
}
