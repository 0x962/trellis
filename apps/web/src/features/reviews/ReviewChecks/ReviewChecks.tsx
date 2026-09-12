import type { ReviewRevision } from "@trellis/api";
import { Badge, EmptyState } from "@trellis/ui";
export function ReviewChecks({ revision }: { revision: ReviewRevision | null }) {
	const checks = revision?.meta.statusCheckRollup as
		| {
				name?: string;
				context?: string;
				conclusion?: string;
				state?: string;
				detailsUrl?: string;
				targetUrl?: string;
		  }[]
		| undefined;
	const latest = new Map(checks?.map((check) => [check.name ?? check.context, check]));
	return (
		<div className="review-scroll">
			<div className="review-list">
				<header className="review-section-heading">
					<h2>Checks</h2>
					<span className="review-meta">
						{latest.size} {latest.size === 1 ? "check" : "checks"}
					</span>
				</header>
				{latest.size ? (
					<div>
						{[...latest].map(([name, check]) => {
							const state = check.conclusion || check.state || "PENDING";
							const tone = ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state)
								? "ok"
								: ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"].includes(state)
									? "bad"
									: "wait";
							return (
								<div className="review-list-row" key={name}>
									<a href={check.detailsUrl ?? check.targetUrl} target="_blank" rel="noreferrer">
										{name}
									</a>
									<Badge tone={tone}>{state.charAt(0) + state.slice(1).toLowerCase().replaceAll("_", " ")}</Badge>
								</div>
							);
						})}
					</div>
				) : (
					<EmptyState title="No checks reported" description="GitHub checks will appear here when they run." />
				)}
			</div>
		</div>
	);
}
