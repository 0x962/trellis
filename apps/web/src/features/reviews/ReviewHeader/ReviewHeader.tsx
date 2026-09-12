import { ArrowLeft, ArrowSquareOut, ArrowsClockwise, ChatCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReviewRevision } from "@trellis/api";
import { IconButton, Segmented, Tooltip } from "@trellis/ui";
import { useEffect } from "react";
import { ReviewActions } from "../ReviewActions/ReviewActions";

type Props = {
	pr: string;
	revision: ReviewRevision | null;
	openCount: number;
	draftCount: number;
	mode: "unified" | "split";
	setMode: (mode: "unified" | "split") => void;
	refreshing: boolean;
	onRefresh: () => void;
	onComment: () => void;
	onSubmit: () => void;
};
export function ReviewHeader({
	pr,
	revision,
	openCount,
	draftCount,
	mode,
	setMode,
	refreshing,
	onRefresh,
	onComment,
	onSubmit,
}: Props) {
	const meta = revision?.meta as
		| {
				title?: string;
				state?: string;
				headRefName?: string;
				baseRefName?: string;
				author?: { login: string };
				additions?: number;
				deletions?: number;
				changedFiles?: number;
				isDraft?: boolean;
		  }
		| undefined;
	useEffect(() => {
		const previous = document.title;
		document.title = `${meta?.title ?? pr} · Trellis`;
		return () => {
			document.title = previous;
		};
	}, [meta?.title, pr]);
	return (
		<header className="review-header">
			<Tooltip content="All reviews">
				<IconButton label="All reviews" icon={<ArrowLeft />} nativeButton={false} render={<Link to="/reviews" />} />
			</Tooltip>
			<div className="review-title">
				<h1>{meta?.title ?? pr.replace("https://github.com/", "")}</h1>
				<p className="review-meta">
					{meta?.isDraft ? "Draft" : (meta?.state ?? "Local review")} · {revision?.headSha.slice(0, 8)} ·{" "}
					{meta?.headRefName} → {meta?.baseRefName} · {openCount} open {openCount === 1 ? "thread" : "threads"}
				</p>
				{meta && (
					<p className="review-meta">
						{meta.author?.login} · {meta.changedFiles} files · +{meta.additions} −{meta.deletions}
					</p>
				)}
			</div>
			<Segmented
				label="Diff layout"
				value={mode}
				options={[
					{ value: "unified", label: "Unified" },
					{ value: "split", label: "Split" },
				]}
				onValueChange={(m) => {
					setMode(m);
				}}
			/>
			<Tooltip content="Refresh from GitHub">
				<IconButton label="Refresh from GitHub" icon={<ArrowsClockwise />} disabled={refreshing} onClick={onRefresh} />
			</Tooltip>
			<Tooltip content="Add comment">
				<IconButton label="Add comment" icon={<ChatCircle />} onClick={onComment} />
			</Tooltip>
			<Tooltip content={`Submit review (${draftCount} drafts)`}>
				<IconButton label="Submit review" icon={<PaperPlaneTilt />} variant="primary" onClick={onSubmit} />
			</Tooltip>
			{draftCount > 0 && (
				<span role="status" className="review-draft-count">
					{draftCount} {draftCount === 1 ? "draft" : "drafts"}
				</span>
			)}
			{revision && <ReviewActions pr={pr} revision={revision} onDone={onRefresh} />}
			<Tooltip content="Open on GitHub">
				<IconButton
					label="Open on GitHub"
					icon={<ArrowSquareOut />}
					nativeButton={false}
					render={<a href={pr} target="_blank" rel="noreferrer" />}
				/>
			</Tooltip>
		</header>
	);
}
