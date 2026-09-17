import { ArrowsClockwise, GitPullRequest, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReviewRevision, reviewRef } from "@trellis/api";
import { Menu } from "@trellis/ui";
import { type ReactNode, useEffect, useState } from "react";
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
	const [actionsOpen, setActionsOpen] = useState(false);
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
		<>
			<Topbar
				actions={
					<Menu
						label="Pull request controls"
						triggerTooltip="Pull request controls"
						items={[
							...(revision
								? [
										{ label: "Review changes", icon: <GitPullRequest />, onSelect: onSubmit },
										{
											label: "Pull request actions",
											icon: <SlidersHorizontal />,
											onSelect: () => setActionsOpen(true),
										},
									]
								: []),
							{ label: "Refresh from GitHub", icon: <ArrowsClockwise />, disabled: refreshing, onSelect: onRefresh },
						]}
					/>
				}
			>
				<PageTitle parent={parent ?? <Link to="/reviews">Pull requests</Link>} title={`${ref.repo} #${ref.number}`} />
			</Topbar>
			{revision && (
				<ReviewActions
					pr={pr}
					revision={revision}
					open={actionsOpen}
					onOpenChange={setActionsOpen}
					onDone={onRefresh}
				/>
			)}
		</>
	);
}
