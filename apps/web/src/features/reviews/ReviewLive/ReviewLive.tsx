import { ArrowClockwise, ArrowSquareOut, CheckCircle, Clock, Cube, GitBranch, HardDrives } from "@phosphor-icons/react";
import type { ReviewRevision } from "@trellis/api";
import { Badge, EmptyState } from "@trellis/ui";
import { ReviewLiveActions } from "./components/ReviewLiveActions";
import { type LiveBranchMeta, liveBranchState } from "./liveBranch";

const displayUrl = (value: string) => value.replace(/^https:\/\//, "").replace(/\/$/, "");

export function ReviewLive({
	pr,
	revision,
	loading,
	onRefresh,
}: {
	pr: string;
	revision: ReviewRevision;
	loading: boolean;
	onRefresh: () => void;
}) {
	const state = liveBranchState(revision.meta as LiveBranchMeta);
	const report = state.report;
	const tone = state.label === "Ready" || state.label === "Available" ? "ok" : state.available ? "wait" : "neutral";
	const statusIcon =
		state.label === "Ready" || state.label === "Available" ? (
			<CheckCircle />
		) : state.available ? (
			<ArrowClockwise />
		) : undefined;
	return (
		<div className="review-scroll">
			<div className="review-list">
				<div className="review-header">
					<h2>Live Branch</h2>
					{!loading && (
						<Badge tone={tone} icon={statusIcon}>
							{state.label}
						</Badge>
					)}
					<ReviewLiveActions pr={pr} revision={revision} onDone={onRefresh} />
				</div>
				{loading ? (
					<p className="review-meta" role="status">
						Load live branch…
					</p>
				) : report ? (
					<>
						{report.url && (
							<section className="review-live-section" aria-labelledby="live-links-heading">
								<h3 id="live-links-heading">Open</h3>
								<div className="review-live-links">
									<a href={report.url} target="_blank" rel="noreferrer">
										<span>Application</span>
										<strong>{displayUrl(report.url)}</strong>
										<ArrowSquareOut aria-hidden="true" />
									</a>
									{report.adminUrl && (
										<a href={report.adminUrl} target="_blank" rel="noreferrer">
											<span>Admin</span>
											<strong>{displayUrl(report.adminUrl)}</strong>
											<ArrowSquareOut aria-hidden="true" />
										</a>
									)}
									{report.gatewayUrl && (
										<a href={report.gatewayUrl} target="_blank" rel="noreferrer">
											<span>Gateway</span>
											<strong>{displayUrl(report.gatewayUrl)}</strong>
											<ArrowSquareOut aria-hidden="true" />
										</a>
									)}
								</div>
							</section>
						)}
						<section className="review-live-section" aria-labelledby="live-details-heading">
							<h3 id="live-details-heading">Details</h3>
							<dl className="review-live-details">
								{report.environment && (
									<div>
										<dt>
											<HardDrives aria-hidden="true" /> Environment
										</dt>
										<dd>{report.environment}</dd>
									</div>
								)}
								{report.branch && (
									<div>
										<dt>
											<GitBranch aria-hidden="true" /> Branch
										</dt>
										<dd>{report.branch}</dd>
									</div>
								)}
								{report.pod && (
									<div>
										<dt>
											<Cube aria-hidden="true" /> Pod
										</dt>
										<dd>{report.pod}</dd>
									</div>
								)}
								{report.updatedAt && (
									<div>
										<dt>
											<Clock aria-hidden="true" /> Updated
										</dt>
										<dd>
											<time dateTime={report.updatedAt}>{new Date(report.updatedAt).toLocaleString()}</time>
										</dd>
									</div>
								)}
							</dl>
						</section>
					</>
				) : (
					<EmptyState title="No live branch" description="Deploy a live branch to create the PR environment." />
				)}
			</div>
		</div>
	);
}
