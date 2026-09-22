import type { ResourceCommentThread } from "@trellis/api";
import { type Column, cell, type Format, printList, printRecord, renderTable, type Writer } from "../../output.ts";

const stateOf = (thread: ResourceCommentThread): string => {
	if (thread.resolved !== null) return "resolved";
	return thread.textRemoved ? "text removed" : "open";
};

const threadColumns: Column<ResourceCommentThread>[] = [
	{ name: "state", value: stateOf },
	{ name: "quote", value: (thread) => cell(thread.anchor.quote) },
	{ name: "comments", value: (thread) => String(thread.comments.length) },
];

// The comments of a thread, one per line under the thread row, so an agent
// reads the whole conversation next to the text it is about.
const commentLines = (thread: ResourceCommentThread): string[] =>
	thread.comments.map((comment) => `  ${comment.actor.displayName ?? comment.actor.name}: ${cell(comment.body)}`);

const threadIdColumn: Column<ResourceCommentThread> = { name: "thread", value: (thread) => thread.id };

export const printThreads = (out: Writer, format: Format, threads: ResourceCommentThread[]): void => {
	const spec = {
		columns: [threadIdColumn, ...threadColumns],
		identifier: (thread: ResourceCommentThread) => thread.id,
	};
	if (format.mode === "table") out.write(renderTable(threads, spec.columns, commentLines));
	else printList(out, format, threads, spec);
};

export const printThread = (out: Writer, format: Format, thread: ResourceCommentThread): void => {
	if (format.mode === "table") {
		out.write(renderTable([thread], [threadIdColumn, ...threadColumns], commentLines));
		return;
	}
	printRecord(out, format, thread, { fields: [threadIdColumn, ...threadColumns], identifier: (row) => row.id });
};
