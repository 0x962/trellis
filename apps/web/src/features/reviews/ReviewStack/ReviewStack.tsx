import { Link } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";

export type ReviewMetadata = {
	mergeQueueEntry?: { position?: number | null } | null;
	stack?: {
		entries: {
			nodes: { position: number; pullRequest: { url: string; number: number; title: string; state: string } }[];
		};
	};
};

export function ReviewStack({
	pr,
	meta,
	error,
}: {
	pr: string;
	meta: ReviewMetadata | undefined;
	error: Error | null;
}) {
	const entries = meta?.stack?.entries.nodes ?? [];
	return (
		<>
			{error && <p className="review-meta">Stack and queue status: {error.message}</p>}
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
