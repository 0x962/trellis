import { Link } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { ReviewPage } from "../../../../reviews/ReviewPage/ReviewPage";
import { initialReviewTab } from "../../../../reviews/ReviewPage/reviewTab";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { BrowserSheet } from "../BrowserSheet";
import { SettingsSheet } from "../SettingsSheet";

export type PullRequestSheetProps = {
	// The identifier of the ticket in the sheet under this one. A pull
	// request that opens from a list has no ticket under it.
	ticket?: string;
};

// The review of one pull request, in a wide `PageSheet`. A person reads code
// here, so the sheet gives the file tree and the diff enough room.
//
// The sheet stays mounted while it is closed. A sheet that mounts open skips
// its slide, so the first pull request would appear with no motion.
export function PullRequestSheet({ ticket }: PullRequestSheetProps) {
	const pr = usePageSheetStore((state) => state.pr);
	const lastTab = usePageSheetStore((state) => state.reviewTab);
	const shown = useShown(pr);
	const ref = shown === null ? null : reviewRef(shown);
	const tab = initialReviewTab(undefined, lastTab);
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
			onReturn={pageSheetActions.returnToPullRequest}
			width="wide"
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
					onTabChange={pageSheetActions.setReviewTab}
				/>
			)}
			<SettingsSheet at="pullRequest" />
			<BrowserSheet at="pullRequest" />
		</PageSheet>
	);
}
