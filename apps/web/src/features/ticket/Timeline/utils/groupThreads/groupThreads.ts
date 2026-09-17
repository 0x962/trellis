import type { Comment, TimelineItem } from "@trellis/api";

// Groups the comments of a timeline page into threads, oldest first.
//
// A comment is a thread root when it carries no `parentId`. A reply carries
// the id of its root, so both map to the same key. The caller draws one
// `CommentThread` per key.
//
// `mentioned` identifies the thread that `MentionedThread` renders above
// the timeline. This map contains the other threads.
export function groupThreads(items: TimelineItem[], mentioned?: string): Map<string, Comment[]> {
	const threads = new Map<string, Comment[]>();
	for (const item of items) {
		if (item.kind !== "comment") continue;
		const rootId = item.parentId ?? item.id;
		if (rootId === mentioned) continue;
		const group = threads.get(rootId);
		if (group === undefined) threads.set(rootId, [item]);
		else group.push(item);
	}
	return threads;
}
