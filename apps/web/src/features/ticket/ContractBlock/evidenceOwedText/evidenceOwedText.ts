import { prPaths } from "@trellis/api";

// Sections 4.2 and 4.3 of docs/research/trellis-for-one-human-and-many-agents.md
// list the evidence of a pull request and mark these items "always". An item
// that one change alone owes, such as a clip or a migration plan, is not here,
// because the file list cannot name it.
const alwaysItem = "summary";
const frontendItems = ["after image", "before image", "capture record", "console list"];
const backendItems = ["verify record", "test proof", "contract table"];

const line = (kind: string, items: readonly string[]) => `${kind}: ${[alwaysItem, ...items].join(" · ")}`;

// The evidence sentence of a ticket. `prPaths` reads the kind of the change
// out of the paths the contract names, and each kind owes one fixed list.
export function evidenceOwedText(repo: string, files: readonly string[]): string {
	if (files.length === 0) {
		return "unknown. The contract names no file.";
	}
	const kind = prPaths(
		repo,
		files.map((path) => ({ path, change: "change" as const })),
	).kind;
	if (kind === "frontend") {
		return line("frontend", frontendItems);
	}
	if (kind === "backend") {
		return line("backend", backendItems);
	}
	return line("mixed", [...frontendItems, ...backendItems]);
}
