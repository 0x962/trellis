import { ArrowRight, ArrowsClockwise, Plus, TextAlignLeft } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type Check, type Project, reviewRef } from "@trellis/api";
import { Button, CheckRibbon, EmptyState, IconButton, Input, Segmented, Sheet, Tooltip } from "@trellis/ui";
import { ReviewStatus } from "@trellis/ui/review";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import "@trellis/ui/review.css";

const checkWords = (checks: readonly Check[]) => {
	if (checks.length === 0) return "without checks";
	const failed = checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").length;
	const pending = checks.filter((check) => check.bucket === "pending").length;
	const passed = checks.filter((check) => check.bucket === "pass").length;
	return [
		failed > 0 ? `${failed} failed` : "",
		pending > 0 ? `${pending} pending` : "",
		passed > 0 ? `${passed} passed` : "",
	]
		.filter(Boolean)
		.join(" ");
};

// The pull requests of one project, grouped by repository. The Linked
// source lists what Trellis holds for the project: a pull request linked
// to a ticket of the project or one of its sub-projects, or kept for a
// review in a repository of the project or one of its ancestors. The My
// open PRs source asks GitHub for the open pull requests of the signed-in
// user in those repositories.
export function ProjectDiffsPage({ project }: { project: Project }) {
	const { client, orpc } = useApp();
	const navigate = useNavigate();
	const prs = useQuery(orpc.reviews.prs.queryOptions({ input: { project: project.path } }));
	const [source, setSource] = useState<"local" | "mine">("local");
	const mine = useQuery({
		...orpc.reviews.mine.queryOptions({ input: { project: project.path } }),
		enabled: source === "mine",
	});
	const [openSheet, setOpenSheet] = useState(false);
	const [value, setValue] = useState("");
	const [filter, setFilter] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const reviewSearch = { project: project.path };
	const open = async () => {
		setBusy(true);
		setError(null);
		try {
			const ref = reviewRef(value);
			await client.reviews.open({ pr: value });
			await navigate({
				to: "/reviews/$owner/$repo/$number",
				params: { owner: ref.owner, repo: ref.repo, number: String(ref.number) },
				search: reviewSearch,
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	const rows =
		source === "local"
			? (prs.data ?? []).map((pr) => ({
					...pr,
					repository: `${pr.owner}/${pr.repo}`,
					state: pr.isQueued ? "QUEUED" : pr.isDraft ? "DRAFT" : pr.state,
				}))
			: (mine.data ?? []).map((pr) => ({
					...reviewRef(pr.url),
					id: pr.url,
					title: pr.title,
					repository: pr.repository.nameWithOwner,
					state: pr.isDraft ? "DRAFT" : "OPEN",
					isDraft: pr.isDraft,
					isQueued: false,
					checks: [],
					ciState: "none" as const,
					open: 0,
					resolved: 0,
				}));
	const visible = rows.filter((pr) => {
		const text = `${pr.repository} ${pr.number} ${pr.title} ${pr.ciState} ${checkWords(pr.checks)}`;
		return text.toLowerCase().includes(filter.toLowerCase());
	});
	const repositories = [...new Set(visible.map((pr) => pr.repository))].sort();
	const query = source === "local" ? prs : mine;
	const empty = filter
		? { title: "No pull requests match", description: "Try another title, repository, or PR number." }
		: source === "local"
			? {
					title: "No pull requests yet",
					description: "Link a pull request to a ticket of this project, or open one for review with the plus button.",
				}
			: {
					title: "No open PRs",
					description: "You have no open pull request in the repositories of this project.",
				};
	return (
		<>
			<Topbar
				actions={
					<>
						<Tooltip content="Refresh pull requests">
							<IconButton
								label="Refresh pull requests"
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
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Diffs" />
			</Topbar>
			<div className="page-card review-index">
				<div className="review-index-toolbar">
					<Segmented
						label="Pull request source"
						value={source}
						onValueChange={setSource}
						options={[
							{ value: "local", label: "Linked" },
							{ value: "mine", label: "My open PRs" },
						]}
					/>
					<Input
						label="Filter pull requests"
						hideLabel
						placeholder="Filter pull requests…"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
					/>
				</div>
				<div className="review-index-body">
					{query.isPending ? (
						<p role="status" className="review-empty">
							Load pull requests…
						</p>
					) : query.isError ? (
						<p role="alert" className="review-error">
							{query.error.message}
						</p>
					) : visible.length === 0 ? (
						<EmptyState variant="page" title={empty.title} description={empty.description} />
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
											aria-label={`#${pr.number} ${pr.title || "Pull request"}, ${pr.state}${pr.open ? `, ${pr.open} open ${pr.open === 1 ? "comment" : "comments"}` : ""}`}
											key={pr.id}
											to="/reviews/$owner/$repo/$number"
											params={{ owner: pr.owner, repo: pr.repo, number: String(pr.number) }}
											search={reviewSearch}
										>
											<span className="review-pr-number">#{pr.number}</span>
											<span className="review-row-title">{pr.title || `Pull request #${pr.number}`}</span>
											<span className="review-row-checks">
												<CheckRibbon checks={pr.checks} size="full" />
												<span>{checkWords(pr.checks)}</span>
											</span>
											{pr.open > 0 && (
												<span
													className="review-row-count"
													title={`${pr.open} open ${pr.open === 1 ? "comment" : "comments"}`}
												>
													<TextAlignLeft aria-hidden="true" />
													{pr.open}
												</span>
											)}
											<ReviewStatus state={pr.state} isDraft={pr.isDraft} isQueued={pr.isQueued} />
											<ArrowRight className="review-row-arrow" aria-hidden="true" />
										</Link>
									))}
							</section>
						))
					)}
				</div>
				<div className="review-index-footer">
					{visible.length} {visible.length === 1 ? "pull request" : "pull requests"}
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
