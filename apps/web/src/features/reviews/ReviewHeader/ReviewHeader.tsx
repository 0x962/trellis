import { ArrowsClockwise, PaperPlaneTilt } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReviewRevision, reviewRef } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { type ReactNode, useEffect } from "react";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { ReviewActions } from "../ReviewActions/ReviewActions";

type Props = {
	pr: string;
	revision: ReviewRevision | null;
	refreshing: boolean;
	onRefresh: () => void;
	onSubmit: () => void;
	parent?: ReactNode;
};
export function ReviewHeader({ pr, revision, refreshing, onRefresh, onSubmit, parent }: Props) {
	const ref = reviewRef(pr);
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
		<Topbar
			actions={
				<>
					<Tooltip content="Refresh from GitHub">
						<IconButton
							label="Refresh from GitHub"
							icon={<ArrowsClockwise />}
							disabled={refreshing}
							onClick={onRefresh}
						/>
					</Tooltip>
					{revision && <ReviewActions pr={pr} revision={revision} onDone={onRefresh} />}
					{revision && (
						<Tooltip content="Review changes">
							<IconButton label="Submit review" icon={<PaperPlaneTilt />} variant="primary" onClick={onSubmit} />
						</Tooltip>
					)}
				</>
			}
		>
			<PageTitle parent={parent ?? <Link to="/reviews">Pull requests</Link>} title={`${ref.repo} #${ref.number}`} />
		</Topbar>
	);
}
