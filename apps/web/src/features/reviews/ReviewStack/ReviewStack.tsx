import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
export function ReviewStack({ pr }: { pr: string }) {
	const { orpc } = useApp();
	const { data, error } = useQuery(orpc.reviews.metadata.queryOptions({ input: { pr } }));
	const meta = data as
		| {
				mergeQueueEntry?: { position: number | null };
				stack?: {
					entries: {
						nodes: { position: number; pullRequest: { url: string; number: number; title: string; state: string } }[];
					};
				};
		  }
		| undefined;
	const entries = meta?.stack?.entries.nodes ?? [];
	return (
		<>
			{error && <p className="review-meta">Stack and queue status: {error.message}</p>}
			{meta?.mergeQueueEntry && (
				<p className="review-notice">In the merge queue · Position {meta.mergeQueueEntry.position ?? "Pending"}</p>
			)}
			{entries.length > 0 && (
				<nav className="review-stack" aria-label="PR stack">
					{[...entries]
						.sort((a, b) => a.position - b.position)
						.map(({ pullRequest: p }) => {
							const ref = reviewRef(p.url);
							return (
								<Link
									key={p.number}
									to="/reviews/$owner/$repo/$number"
									params={{ owner: ref.owner, repo: ref.repo, number: String(ref.number) }}
									title={p.title}
									aria-current={p.url === pr ? "page" : undefined}
								>
									#{p.number} · {p.state}
								</Link>
							);
						})}
				</nav>
			)}
		</>
	);
}
