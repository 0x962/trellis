import { Badge } from "../../primitives/Badge";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";

type Check = {
	name: string;
	workflow?: string | null;
	bucket: "pass" | "fail" | "pending" | "skipping" | "cancel";
	link: string | null;
};
type PullRequestChecks = {
	id: string;
	pullRequestName: string;
	error: string | null;
	checks: Check[];
};
type CheckResultsProps =
	| { status: "pending" }
	| { status: "error"; error: string; pullRequests?: PullRequestChecks[] }
	| { status: "ready"; pullRequests: PullRequestChecks[] };
const labels = { pass: "Passed", fail: "Failed", pending: "Pending", skipping: "Skipped", cancel: "Canceled" };

const checksWithKeys = (checks: Check[]) => {
	const occurrences = new Map<string, number>();
	return checks.map((check) => {
		const identity = JSON.stringify([check.workflow, check.name, check.bucket, check.link]);
		const occurrence = occurrences.get(identity) ?? 0;
		occurrences.set(identity, occurrence + 1);
		return { check, key: `${identity}-${occurrence}` };
	});
};

export function CheckResults(props: CheckResultsProps) {
	if (props.status === "pending")
		return (
			<p role="status" className="text-sm text-fg-muted">
				Load pull request checks…
			</p>
		);
	const pullRequests = props.pullRequests ?? [];
	if (props.status === "error" && pullRequests.length === 0)
		return (
			<p role="alert" className="text-sm text-danger">
				Could not load pull request checks. {props.error}
			</p>
		);
	if (pullRequests.length === 0)
		return (
			<EmptyState
				title="No pull request checks"
				description="Link a pull request to see its reported checks. Terminal activity does not count as a passed check."
			/>
		);
	return (
		<div className="flex flex-col gap-6">
			{props.status === "error" && (
				<p role="alert" className="text-sm text-danger">
					Could not refresh pull request checks. {props.error}
				</p>
			)}
			{pullRequests.map((pullRequest) => (
				<section key={pullRequest.id} aria-label={pullRequest.pullRequestName} className="flex flex-col gap-2">
					<SectionHeader title={pullRequest.pullRequestName} level={3} />
					{pullRequest.error && (
						<p role="alert" className="text-sm text-danger">
							The last read failed. {pullRequest.error}
						</p>
					)}
					{pullRequest.checks.length === 0 ? (
						!pullRequest.error && <EmptyState description="GitHub reported no checks for this pull request." />
					) : (
						<ul className="flex flex-col gap-2">
							{checksWithKeys(pullRequest.checks).map(({ check, key }) => (
								<li
									key={key}
									className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
								>
									{check.link ? (
										<a
											href={check.link}
											target="_blank"
											rel="noreferrer"
											className="min-w-0 break-words underline decoration-border-strong underline-offset-2"
										>
											{check.name}
										</a>
									) : (
										<span className="min-w-0 break-words">{check.name}</span>
									)}
									<Badge
										tone={
											check.bucket === "pass"
												? "ok"
												: check.bucket === "fail" || check.bucket === "cancel"
													? "bad"
													: "neutral"
										}
									>
										{labels[check.bucket]}
									</Badge>
								</li>
							))}
						</ul>
					)}
				</section>
			))}
		</div>
	);
}
