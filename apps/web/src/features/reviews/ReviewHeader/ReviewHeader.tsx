import { ArrowsClockwise } from "@phosphor-icons/react";
import { type ReviewRevision, reviewRef } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { type ReactNode, useEffect } from "react";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";

type Props = {
	pr: string;
	revision: ReviewRevision | null;
	refreshing: boolean;
	onRefresh: () => void;
	// The link to the page the review opened from: the Diffs page of a
	// project, or the ticket. A review opened by its URL has none.
	parent?: ReactNode;
};
export function ReviewHeader({ pr, revision, refreshing, onRefresh, parent }: Props) {
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
				<Tooltip content="Refresh from GitHub">
					<IconButton
						label="Refresh from GitHub"
						icon={<ArrowsClockwise />}
						disabled={refreshing}
						onClick={onRefresh}
					/>
				</Tooltip>
			}
		>
			<PageTitle parent={parent} title={`${ref.repo} #${ref.number}`} />
		</Topbar>
	);
}
