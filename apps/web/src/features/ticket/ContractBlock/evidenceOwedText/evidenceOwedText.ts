import { prPaths } from "@trellis/api";

// Sections 4.2 and 4.3 of docs/research/trellis-for-one-human-and-many-agents.md
// mark these items "always". A file list gives only the kind of the change, so
// these lists hold only the items that every change of that kind owes.
const everyKindOwes = "summary";
const frontendOwes = ["after image", "before image", "capture record", "console list"];
const backendOwes = ["verify record", "test proof", "contract table"];

const evidenceLine = (kind: string, items: readonly string[]) => `${kind}: ${[everyKindOwes, ...items].join(" · ")}`;

export function evidenceOwedText(repo: string, files: readonly string[]): string {
	if (files.length === 0) {
		return "unknown. The contract names no file.";
	}
	const kind = prPaths(
		repo,
		files.map((path) => ({ path, change: "change" as const })),
	).kind;
	if (kind === "frontend") {
		return evidenceLine("frontend", frontendOwes);
	}
	if (kind === "backend") {
		return evidenceLine("backend", backendOwes);
	}
	return evidenceLine("mixed", [...frontendOwes, ...backendOwes]);
}
