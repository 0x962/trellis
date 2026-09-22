import type { Mergeable, PrState } from "@trellis/api";
import { CONFLICT_NOTICE_KINDS } from "../db/tables/checkNotices.ts";
import type { CheckNoticeKind, NoticeDecision, StoredNotice } from "./checkNotice.ts";

// Decides whether the agent of a pull request must hear that its branch
// cannot merge into the base branch, or that it can merge again. The rule
// reads only what the poller stored and the notices already written, so it
// gives the same answer after a restart.
//
// - conflict: GitHub answers `conflicting`, and the newest merge notice is
//   not a conflict notice for the same head commit. One message per head
//   commit, and one more when the base branch breaks the merge again after a
//   clear notice.
// - clear: GitHub answers `mergeable`, and the newest merge notice of the
//   pull request said conflict.
// GitHub answers `unknown` until it has computed the merge after a push or a
// base change, and that answer sends nothing: the next poll reads the result.
// A pull request that GitHub marks as a draft sends nothing. A pull request
// whose local state is draft still sends, because its agent owns the branch.

export type ConflictSubject = { state: PrState; isDraft: boolean; headSha: string | null; mergeable: Mergeable };

const conflictKinds: readonly CheckNoticeKind[] = CONFLICT_NOTICE_KINDS;

export const isConflictKind = (kind: CheckNoticeKind) => conflictKinds.includes(kind);

// `notices` holds every merge notice of the pull request, oldest first.
export const decideConflictNotice = (subject: ConflictSubject, notices: StoredNotice[]): NoticeDecision | null => {
	if (subject.state !== "open" || subject.isDraft || subject.headSha === null) return null;
	const newest = notices.at(-1);
	if (subject.mergeable === "conflicting") {
		const told = newest?.kind === "conflict" && newest.headSha === subject.headSha;
		return told ? null : { kind: "conflict", checks: [] };
	}
	if (subject.mergeable === "mergeable" && newest?.kind === "conflict") return { kind: "clear", checks: [] };
	return null;
};
