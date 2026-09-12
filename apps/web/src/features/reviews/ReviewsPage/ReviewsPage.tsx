import { ArrowRight, ArrowsClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import { EmptyState, IconButton, Input, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import "@trellis/ui/review.css";
export function ReviewsPage() {
	const { client, orpc } = useApp();
	const navigate = useNavigate();
	const prs = useQuery(orpc.reviews.prs.queryOptions({ input: {} }));
	const [showMine, setShowMine] = useState(false);
	const mine = useQuery({ ...orpc.reviews.mine.queryOptions({ input: {} }), enabled: showMine });
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
	return (
		<>
			<Topbar
				actions={
					<Tooltip content="Refresh reviews">
						<IconButton label="Refresh reviews" icon={<ArrowsClockwise />} onClick={() => void prs.refetch()} />
					</Tooltip>
				}
			>
				<PageTitle title="Reviews" />
			</Topbar>
			<div className="review-scroll">
				<div className="review-list">
					<p>Review code and discuss findings with your agents. Comments stay on this machine.</p>
					<form
						className="review-header"
						onSubmit={(e) => {
							e.preventDefault();
							void open();
						}}
					>
						<Input
							label="Pull request"
							placeholder="Paste a GitHub PR URL or owner/repo#123"
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
						<Tooltip content="Open review">
							<IconButton type="submit" label="Open review" icon={<ArrowRight />} disabled={busy || !value.trim()} />
						</Tooltip>
					</form>
					{error && (
						<p role="alert" className="review-error">
							{error}
						</p>
					)}
					<details onToggle={(event) => setShowMine(event.currentTarget.open)}>
						<summary>My open pull requests</summary>
						{showMine &&
							(mine.isPending ? (
								<p role="status">Load pull requests…</p>
							) : mine.isError ? (
								<p role="alert">{mine.error.message}</p>
							) : mine.data.length === 0 ? (
								<p>No open pull requests.</p>
							) : (
								mine.data.map((pr) => {
									const ref = reviewRef(pr.url);
									return (
										<div className="review-list-row" key={pr.url}>
											<Link
												to="/reviews/$owner/$repo/$number"
												params={{ owner: ref.owner, repo: ref.repo, number: String(ref.number) }}
											>
												{pr.title}
												<p className="review-meta">
													{pr.repository.nameWithOwner} #{pr.number}
													{pr.isDraft ? " · Draft" : ""}
												</p>
											</Link>
										</div>
									);
								})
							))}
					</details>
					<Input
						label="Filter reviews"
						placeholder="Repository, title, or PR number"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
					{prs.isPending ? (
						<p role="status">Load reviews…</p>
					) : prs.isError ? (
						<p role="alert">{prs.error.message}</p>
					) : prs.data.length === 0 ? (
						<EmptyState title="No reviews yet" description="Open a pull request to start a local review." />
					) : (
						prs.data
							.filter((p) => `${p.owner}/${p.repo} ${p.number} ${p.title}`.toLowerCase().includes(filter.toLowerCase()))
							.map((p) => (
								<div className="review-list-row" key={p.id}>
									<Link
										to="/reviews/$owner/$repo/$number"
										params={{ owner: p.owner, repo: p.repo, number: String(p.number) }}
									>
										<strong>{p.title || `${p.owner}/${p.repo}#${p.number}`}</strong>
										<p className="review-meta">
											{p.owner}/{p.repo} #{p.number} · {p.state}
										</p>
									</Link>
									<span className="review-meta">
										{p.open} open · {p.resolved} resolved
									</span>
								</div>
							))
					)}
				</div>
			</div>
		</>
	);
}
