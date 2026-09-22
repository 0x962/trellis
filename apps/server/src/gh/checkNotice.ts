import type { Check, CiState, PrState } from "@trellis/api";
import type { CHECK_NOTICE_KINDS } from "../db/tables/checkNotices.ts";

// Decides which change in the stored checks of one pull request the agent of
// its ticket must hear about. The rule reads only what the poller stored and
// the notices already written, so it gives the same answer after a restart.
//
// Three changes are worth a message:
// - failed: a check fails on the head commit. The message waits until no
//   check is pending, or until no check changed for SETTLE_MS, so a burst of
//   failures travels as one message. A later failure on the same head that
//   no earlier notice named sends a new message.
// - passed: every check passes, and the newest notice of the pull request
//   said failed or stuck. The agent that heard about a failure learns that
//   the fix worked, also on a new head commit.
// - stuck: a check is pending and no check changed for STUCK_MS. One message
//   per head commit and set of pending checks.
// Every other change (a check starts, one more check passes, a check is
// skipped) needs no action from the agent, so it sends nothing.

export const SETTLE_MS = 60_000;
export const STUCK_MS = 1_800_000;

export type CheckNoticeKind = (typeof CHECK_NOTICE_KINDS)[number];

// One check as a notice names it. `lines` holds the first lines of the
// failure output, and the poller fills it after this rule decides.
export type NoticeCheck = { name: string; workflow: string | null; link: string | null; lines: string[] };

export type StoredNotice = { headSha: string; kind: CheckNoticeKind; checks: NoticeCheck[] };

// The stored fields of one pull request that the rule reads.
// `checksChangedAt` is null for a row that no write changed since the column
// exists, and such a row sends nothing.
export type NoticeSubject = {
	state: PrState;
	headSha: string | null;
	ciState: CiState;
	checks: Check[];
	checksChangedAt: string | null;
};

export type NoticeDecision = { kind: CheckNoticeKind; checks: NoticeCheck[] };

const keyOf = (check: { name: string; workflow: string | null }) => `${check.workflow ?? ""}\u0000${check.name}`;

const noticeCheck = (check: Check): NoticeCheck => ({
	name: check.name,
	workflow: check.workflow,
	link: check.link,
	lines: [],
});

const sameKeys = (a: NoticeCheck[], b: Check[]) => {
	const keys = new Set(a.map(keyOf));
	return a.length === b.length && b.every((check) => keys.has(keyOf(check)));
};

// `notices` holds every notice of the pull request, oldest first.
export const decideNotice = (subject: NoticeSubject, notices: StoredNotice[], nowMs: number): NoticeDecision | null => {
	if (subject.state !== "open" || subject.headSha === null || subject.checksChangedAt === null) return null;
	const quietMs = nowMs - Date.parse(subject.checksChangedAt);
	const onHead = notices.filter((notice) => notice.headSha === subject.headSha);
	const failing = subject.checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel");
	const pending = subject.checks.filter((check) => check.bucket === "pending");

	if (failing.length > 0) {
		if (pending.length > 0 && quietMs < SETTLE_MS) return null;
		const named = new Set(
			onHead.filter((notice) => notice.kind === "failed").flatMap((notice) => notice.checks.map(keyOf)),
		);
		if (failing.every((check) => named.has(keyOf(check)))) return null;
		return { kind: "failed", checks: failing.map(noticeCheck) };
	}

	if (subject.ciState === "pass") {
		const newest = notices.at(-1);
		if (newest === undefined || newest.kind === "passed") return null;
		return { kind: "passed", checks: [] };
	}

	if (pending.length > 0 && quietMs >= STUCK_MS) {
		const told = onHead.some((notice) => notice.kind === "stuck" && sameKeys(notice.checks, pending));
		if (told) return null;
		return { kind: "stuck", checks: pending.map(noticeCheck) };
	}

	return null;
};
