import type { PrState } from "@trellis/api";
import { QUEUE_NOTICE_KINDS } from "../db/tables/checkNotices.ts";
import type { CheckNoticeKind, NoticeDecision, StoredNotice } from "./checkNotice.ts";

export type QueueSubject = { state: PrState; isQueued: boolean; headSha: string | null };
export type QueueNoticeKind = (typeof QUEUE_NOTICE_KINDS)[number];

const queueKinds: readonly CheckNoticeKind[] = QUEUE_NOTICE_KINDS;

export const isQueueKind = (kind: CheckNoticeKind): kind is QueueNoticeKind => queueKinds.includes(kind);

export const decideQueueNotice = (subject: QueueSubject, notices: StoredNotice[]): NoticeDecision | null => {
	if (subject.headSha === null) return null;
	const newest = notices.at(-1);
	if (subject.state === "merged") return newest?.kind === "queued" ? { kind: "merged", checks: [] } : null;
	if (subject.state !== "open") return newest?.kind === "queued" ? { kind: "dequeued", checks: [] } : null;
	if (subject.isQueued) return newest?.kind === "queued" ? null : { kind: "queued", checks: [] };
	return newest?.kind === "queued" ? { kind: "dequeued", checks: [] } : null;
};
