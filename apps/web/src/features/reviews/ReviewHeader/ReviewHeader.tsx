import { type ReviewRevision, reviewRef, type TicketPr } from "@trellis/api";
import { ReviewStateIcon } from "@trellis/ui";
import { type ReactNode, useEffect } from "react";
import { usePageSheet } from "../../shell/PageSheet";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";

type Props = {
	pr: string;
	revision: ReviewRevision | null;
	// The link to the page the review opened from: the Diffs page of a
	// project, or the ticket. A review opened by its URL has none.
	parent?: ReactNode;
	// The current verdict of the person, or null.
	verdict: TicketPr["verdict"];
};
export function ReviewHeader({ pr, revision, parent, verdict }: Props) {
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
	// A review in a `PageSheet` leaves the browser tab with the title of the
	// page under the sheet.
	const inSheet = usePageSheet() !== null;
	useEffect(() => {
		if (inSheet) return;
		const previous = document.title;
		document.title = `${meta?.title ?? pr} · Trellis`;
		return () => {
			document.title = previous;
		};
	}, [inSheet, meta?.title, pr]);
	return (
		<Topbar>
			<PageTitle parent={parent} title={`${ref.repo} #${ref.number}`} />
			{verdict && <ReviewStateIcon reviewState={verdict} notReady={false} />}
		</Topbar>
	);
}
