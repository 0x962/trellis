import type { ReviewRevision } from "@trellis/api";
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
	const latest = new Map(checks?.map((c) => [c.name ?? c.context, c]));
	return (
		<div className="review-scroll">
			{latest.size ? (
				[...latest].map(([name, c]) => (
					<div className="review-list-row" key={name}>
						<a href={c.detailsUrl ?? c.targetUrl} target="_blank" rel="noreferrer">
							{name}
						</a>
						<span>{c.conclusion || c.state || "Pending"}</span>
					</div>
				))
			) : (
				<p>No checks reported.</p>
			)}
		</div>
	);
}
