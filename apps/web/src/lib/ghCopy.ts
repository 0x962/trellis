import type { GhReason } from "@trellis/api";

// What to say and what to run for each reason gh cannot answer. The settings
// page and the PR section read this table, so the two surfaces
// never word one failure in two ways. An error the server could not name
// carries the server's own message and no command.
export const ghCopy: Record<GhReason, { line: string; command: string | null }> = {
	missing: { line: "trellis cannot find the GitHub CLI.", command: "brew install gh" },
	unauthenticated: { line: "gh is not signed in.", command: "gh auth login" },
	error: { line: "gh did not answer.", command: null },
};

// What a gh failure costs the reader, said once for every surface.
export const ghConsequence = "PR checks stay empty until gh answers.";
