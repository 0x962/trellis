import { Link } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import { useState } from "react";
import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { ReviewPage } from "../../../../reviews/ReviewPage/ReviewPage";
import type { ReviewTab } from "../../../../reviews/ReviewPage/reviewTab";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { BrowserSheet } from "../BrowserSheet";

export type PullRequestSheetProps = {
	// The identifier of the ticket in the sheet under this one. A pull
	// request that opens from a list has no ticket under it.
	ticket?: string;
};

// The review of one pull request, in a `PageSheet` that takes the width of
// the window. A person reads code here, so the sheet gives the file tree and
// the diff every pixel the window has.
//
// The sheet stays mounted while it is closed. A sheet that mounts open skips
// its slide, so the first pull request would appear with no motion.
export function PullRequestSheet({ ticket }: PullRequestSheetProps) {
	const pr = usePageSheetStore((state) => state.pr);
	const shown = useShown(pr);
	const ref = shown === null ? null : reviewRef(shown);
	// The page under the sheet owns the URL, so the sheet holds the picked tab
	// and hands it to the full-page link. A tab picked for one pull request
	// does not carry over to the next.
	const [picked, setPicked] = useState<{ pr: string; tab: ReviewTab } | null>(null);
	const tab = picked !== null && picked.pr === shown ? picked.tab : undefined;
	// The header of the review names the ticket under it. A click on that
	// name closes the review and leaves the ticket open.
	const parent =
		ticket === undefined ? undefined : (
			<a
				href={`/t/${ticket}`}
				aria-label={`Back to ${ticket}`}
				onClick={(event) => {
					event.preventDefault();
					pageSheetActions.closePullRequest();
				}}
			>
				{ticket}
			</a>
		);
	return (
		<PageSheet
			open={pr !== null}
			onClose={pageSheetActions.closePullRequest}
			width="full"
			title={ref === null ? "Pull request" : `${ref.repo} #${ref.number}`}
			fullPage={
				ref === null ? undefined : (
					<Link
						to="/reviews/$owner/$repo/$number"
						params={{ owner: ref.owner, repo: ref.repo, number: String(ref.number) }}
						search={{ ...(ticket === undefined ? {} : { ticket }), ...(tab === undefined ? {} : { tab }) }}
					/>
				)
			}
		>
			{shown !== null && (
				<ReviewPage
					key={shown}
					pr={shown}
					syncHash={false}
					parent={parent}
					tab={tab}
					onTabChange={(next) => setPicked({ pr: shown, tab: next })}
				/>
			)}
			<BrowserSheet at="pullRequest" />
		</PageSheet>
	);
}
