import { Badge } from "../../primitives/Badge";
import { EmptyState } from "../../primitives/EmptyState";

type Check = {
	id: string;
	command: string;
	args: string[];
	state: string;
	current: boolean;
	output: string;
	error: string | null;
	truncated: boolean;
};
type Artifact = { id: string; path: string; current: boolean };

export function LocalEvidence({
	checks,
	artifacts,
	readyForReview,
}: {
	checks: Check[];
	artifacts: Artifact[];
	readyForReview: boolean;
}) {
	return (
		<section aria-label="Local evidence" className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-sm font-medium">Local evidence</h3>
				<Badge tone={readyForReview ? "ok" : "neutral"}>
					{readyForReview ? "Evidence ready for review" : "Evidence incomplete"}
				</Badge>
			</div>
			{artifacts.length > 0 && (
				<ul aria-label="Registered files" className="flex flex-col gap-2">
					{artifacts.map((artifact) => (
						<li
							key={artifact.id}
							className="flex items-center justify-between gap-3 border border-border px-3 py-2 text-sm"
						>
							<code className="min-w-0 break-all font-mono">{artifact.path}</code>
							<Badge tone={artifact.current ? "ok" : "neutral"}>
								{artifact.current ? "Current file" : "File changed"}
							</Badge>
						</li>
					))}
				</ul>
			)}
			{checks.length === 0 ? (
				<EmptyState
					title="No local checks"
					description="Run a check in this workspace and register the output files before review."
				/>
			) : (
				checks.map((check) => (
					<details key={check.id} className="border border-border" open={checks.length === 1}>
						<summary className="cursor-pointer px-3 py-2 text-sm focus-visible:outline focus-visible:outline-accent">
							<span className="inline-flex max-w-full items-center gap-3">
								<code className="min-w-0 break-all font-mono">{[check.command, ...check.args].join(" ")}</code>
								<Badge
									tone={
										!check.current
											? "neutral"
											: check.state === "passed"
												? "ok"
												: ["failed", "timed_out", "unknown"].includes(check.state)
													? "bad"
													: "neutral"
									}
								>
									{!check.current
										? "Out of date"
										: check.state === "passed"
											? "Passed"
											: check.state.replaceAll("_", " ")}
								</Badge>
							</span>
						</summary>
						{check.error && (
							<p role="alert" className="px-3 py-2 text-sm text-danger">
								{check.error}
							</p>
						)}
						{check.truncated && <p className="px-3 text-sm text-fg-muted">Earlier check output expired.</p>}
						<pre className="overflow-auto border-t border-border bg-surface px-3 py-3 font-mono text-xs tabular-nums">
							{check.output || "The check has no output."}
						</pre>
					</details>
				))
			)}
		</section>
	);
}
