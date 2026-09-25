export const CONFLICT_NOTICE_KINDS = ["conflict", "clear"] as const;
export const QUEUE_NOTICE_KINDS = ["queued", "dequeued", "merged"] as const;
export const CHECK_NOTICE_KINDS = [
	"failed",
	"passed",
	"stuck",
	...CONFLICT_NOTICE_KINDS,
	...QUEUE_NOTICE_KINDS,
] as const;

export type CheckNoticeKind = (typeof CHECK_NOTICE_KINDS)[number];
export type QueueNoticeKind = (typeof QUEUE_NOTICE_KINDS)[number];

const queueNoticeKinds: readonly CheckNoticeKind[] = QUEUE_NOTICE_KINDS;

export const isQueueNoticeKind = (kind: CheckNoticeKind): kind is QueueNoticeKind => queueNoticeKinds.includes(kind);
