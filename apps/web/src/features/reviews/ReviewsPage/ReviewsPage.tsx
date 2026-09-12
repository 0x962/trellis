import { ArrowRight, ArrowsClockwise, ChatCircle, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import { Button, EmptyState, IconButton, Input, Segmented, Sheet, Tooltip } from "@trellis/ui";
import { ReviewStatus } from "@trellis/ui/review";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import "@trellis/ui/review.css";
export function ReviewsPage() {
	const { client, orpc } = useApp();
	const navigate = useNavigate();
	const prs = useQuery(orpc.reviews.prs.queryOptions({ input: {} }));
	const [source, setSource] = useState<"local" | "mine">("local");
	const mine = useQuery({ ...orpc.reviews.mine.queryOptions({ input: {} }), enabled: source === "mine" });
	const [openSheet, setOpenSheet] = useState(false);
	const [value, setValue] = useState("");
	const [filter, setFilter] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const open = async () => {
		setBusy(true);
		setError(null);
		try {
			const ref = reviewRef(value);
			await client.reviews.open({ pr: value });
			await navigate({
				to: "/reviews/$owner/$repo/$number",
				params: { owner: ref.owner, repo: ref.repo, number: String(ref.number) },
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	const rows =
		source === "local"
			? (prs.data ?? []).map((pr) => ({ ...pr, repository: `${pr.owner}/${pr.repo}` }))
			: (mine.data ?? []).map((pr) => ({
					...reviewRef(pr.url),
					id: pr.url,
					title: pr.title,
					repository: pr.repository.nameWithOwner,
					state: pr.isDraft ? "DRAFT" : "OPEN",
					open: 0,
					resolved: 0,
				}));
	const visible = rows.filter((pr) =>
		`${pr.repository} ${pr.number} ${pr.title}`.toLowerCase().includes(filter.toLowerCase()),
	);
	const repositories = [...new Set(visible.map((pr) => pr.repository))].sort();
	const query = source === "local" ? prs : mine;
	return (
		<>
			<Topbar
				actions={
					<>
						<Tooltip content="Refresh reviews">
							<IconButton
								label="Refresh reviews"
								icon={<ArrowsClockwise />}
								disabled={query.isFetching}
								onClick={() => void query.refetch()}
							/>
						</Tooltip>
						<Tooltip content="Open review">
							<IconButton label="Open review" icon={<Plus />} variant="primary" onClick={() => setOpenSheet(true)} />
						</Tooltip>
					</>
				}
			>
				<PageTitle title="Reviews" />
			</Topbar>
			<div className="page-card review-index">
				<div className="review-index-toolbar">
					<Segmented
						label="Review source"
						value={source}
						onValueChange={setSource}
						options={[
							{ value: "local", label: "Local reviews" },
							{ value: "mine", label: "My open PRs" },
						]}
					/>
					<Input
						label="Filter reviews"
						hideLabel
						placeholder="Filter reviews…"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
					/>
				</div>
				<div className="review-index-body">
					{query.isPending ? (
						<p role="status" className="review-empty">
							Load reviews…
						</p>
					) : query.isError ? (
						<p role="alert" className="review-error">
							{query.error.message}
						</p>
					) : visible.length === 0 ? (
						<EmptyState
							title={filter ? "No reviews match" : "No reviews yet"}
							description={
								filter ? "Try another title, repository, or PR number." : "Open a pull request to start a local review."
							}
						/>
					) : (
						repositories.map((repository) => (
							<section className="review-repository" key={repository} aria-label={repository}>
								<header className="review-section-heading">
									<h2>{repository}</h2>
									<span className="review-meta">{visible.filter((pr) => pr.repository === repository).length}</span>
								</header>
								{visible
									.filter((pr) => pr.repository === repository)
									.map((pr) => (
										<Link
											className="review-index-row"
											aria-label={`#${pr.number} ${pr.title || "Pull request"}, ${pr.state}${pr.open ? `, ${pr.open} open ${pr.open === 1 ? "thread" : "threads"}` : ""}`}
											key={pr.id}
											to="/reviews/$owner/$repo/$number"
											params={{ owner: pr.owner, repo: pr.repo, number: String(pr.number) }}
										>
											<span className="review-pr-number">#{pr.number}</span>
											<span className="review-row-title">{pr.title || `Pull request #${pr.number}`}</span>
											{pr.open > 0 && (
												<span
													className="review-row-count"
													title={`${pr.open} open ${pr.open === 1 ? "thread" : "threads"}`}
												>
													<ChatCircle aria-hidden="true" />
													{pr.open}
												</span>
											)}
											<ReviewStatus state={pr.state} />
											<ArrowRight className="review-row-arrow" aria-hidden="true" />
										</Link>
									))}
							</section>
						))
					)}
				</div>
				<div className="review-index-footer">
					{visible.length} {visible.length === 1 ? "review" : "reviews"}
				</div>
			</div>
			{openSheet && (
				<Sheet
					open
					title="Open review"
					onOpenChange={(next) => !next && !busy && setOpenSheet(false)}
					width="var(--review-sheet-width)"
					titleClassName="font-medium text-base"
				>
					<form
						className="review-form"
						onSubmit={(event) => {
							event.preventDefault();
							void open();
						}}
					>
						<Input
							label="Pull request"
							placeholder="GitHub URL or owner/repo#123"
							value={value}
							onChange={(event) => setValue(event.target.value)}
						/>
						{error && (
							<p role="alert" className="review-error">
								{error}
							</p>
						)}
						<div className="review-form-actions">
							<Button type="button" onClick={() => setOpenSheet(false)}>
								Cancel
							</Button>
							<Button type="submit" variant="primary" disabled={busy || !value.trim()}>
								Open review
							</Button>
						</div>
					</form>
				</Sheet>
			)}
		</>
	);
}
