import type { GhReason } from "./schemas/enums.ts";

// What to say, and what to run, for each reason the gh binary cannot answer.
// The web pages and the CLI read this one table, so the two surfaces never
// word the same failure in two ways. The `error` reason has no command,
// because only the server's own message explains it.
export const ghCopy: Record<GhReason, { line: string; command: string | null }> = {
	missing: { line: "trellis cannot find the GitHub CLI.", command: "brew install gh" },
	unauthenticated: { line: "gh is not signed in.", command: "gh auth login" },
	error: { line: "gh did not answer.", command: null },
};
