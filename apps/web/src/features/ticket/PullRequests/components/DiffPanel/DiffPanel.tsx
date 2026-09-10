import type { LinkedPullRequest } from "@trellis/api";

export type DiffPanelProps = {
	pr: Pick<LinkedPullRequest, "url">;
};

// The diff renderer lands in M4. Until then the panel names the milestone
// and links the diff on GitHub. It calls no procedure.
export function DiffPanel({ pr }: DiffPanelProps) {
	return (
		<div className="flex h-9 items-center gap-2 border-t border-border px-3 text-sm text-fg-muted">
			<span>The diff view arrives in M4.</span>
			<a
				href={`${pr.url}/files`}
				target="_blank"
				rel="noopener noreferrer"
				className="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
			>
				Open the diff on GitHub
			</a>
		</div>
	);
}
