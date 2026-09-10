import type { GhStatus } from "@trellis/api";

export type GhNoticeProps = {
	gh: GhStatus;
};

// The command that fixes each reason gh cannot serve a request.
const commands: Record<string, string> = {
	missing: "brew install gh && gh auth login",
	unauthenticated: "gh auth login",
	error: "gh auth status",
};

// gh cannot poll the pull requests. The notice sits in the section, never
// in a toast, and names the command that fixes it.
export function GhNotice({ gh }: GhNoticeProps) {
	return (
		<div
			role="alert"
			className="flex flex-wrap items-center gap-2 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-fg"
		>
			<span>{gh.message ?? "gh is not available, so the pull requests are not refreshed."}</span>
			<code className="rounded-sm border border-border bg-bg px-1.5 py-0.5 font-mono text-xs">
				{commands[gh.reason ?? "error"]}
			</code>
		</div>
	);
}
