import { Link } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import { type ReactNode, useState } from "react";
import { ReviewPage } from "../../../../reviews/ReviewPage/ReviewPage";
import { PageSheet } from "../../../../shell/PageSheet";

export type PullRequestSheetProps = {
	// The URL of the pull request to show, or null while the sheet is closed.
	pr: string | null;
	// The link back to the ticket, drawn before the name of the pull request.
	parent: ReactNode;
	onClose: () => void;
};

// The review of one pull request, in a `PageSheet`. `TicketView` renders it
// when the ticket itself sits in a `PageSheet`, so this sheet opens over the
// ticket sheet and the ticket stays open under it.
//
// The sheet stays mounted while it is closed. A sheet that mounts open skips
// its slide, so the first pull request would appear with no motion.
export function PullRequestSheet({ pr, parent, onClose }: PullRequestSheetProps) {
	// The sheet slides out after `pr` becomes null. `shown` keeps the last
	// URL, so the review stays on screen until the slide ends. It is null
	// only before the first pull request opens.
	const [shown, setShown] = useState(pr);
	if (pr !== null && pr !== shown) setShown(pr);
	const ref = shown === null ? null : reviewRef(shown);
	return (
		<PageSheet
			open={pr !== null}
			onClose={onClose}
			title={ref === null ? "Pull request" : `${ref.repo} #${ref.number}`}
			fullPage={
				ref === null ? undefined : (
					<Link
						to="/reviews/$owner/$repo/$number"
						params={{ owner: ref.owner, repo: ref.repo, number: String(ref.number) }}
					/>
				)
			}
		>
			{shown !== null && <ReviewPage key={shown} pr={shown} syncHash={false} parent={parent} />}
		</PageSheet>
	);
}
