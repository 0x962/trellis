import { type CheckNoticeKind, type NoticeCheck, STUCK_MS } from "../../gh/checkNotice.ts";
import type { QueueNoticeKind } from "../../noticeKind/index.ts";

// The text that an agent reads when a review delivery reaches its terminal.

// A local verdict for the pull request of an agent. The message includes the
// note because `trellis review list` shows the comments, not the submission.
export const reviewMessage = (input: {
	url: string;
	drafts: number;
	verdict: "commented" | "changes_requested" | "approved";
	body: string;
}) => {
	const note = input.body === "" ? "" : `\nReview note: ${input.body}`;
	if (input.verdict === "approved") return `trellis: your pull request review passed. It waits for the merge.${note}`;
	const opening =
		input.verdict === "changes_requested"
			? "trellis: your pull request needs changes."
			: "trellis: your pull request has a comment.";
	if (input.drafts === 0) return `${opening}${note}`;
	const count = `The review has ${input.drafts} ${input.drafts === 1 ? "comment" : "comments"}.`;
	return `${opening} ${count}${note}\nRead the comments: trellis review list ${input.url}\nApply what each comment asks. Answer each comment.`;
};

// One comment on a diff line. `body` is the text of that one comment, and
// `path` with `line` is the place the thread points at.
export type CommentNote = { path: string; line: number; body: string };

// The comments on the pull request of an agent. One message carries every
// comment the dispatcher holds for that agent, so ten comments in a row stop
// the work once. The text of each comment travels with it, because the agent
// can read and answer without another command.
export const commentMessage = (input: { url: string; comments: CommentNote[] }) => {
	const count = input.comments.length;
	const opening = `trellis: your pull request has ${count} new ${count === 1 ? "comment" : "comments"}.`;
	const notes = input.comments.map((comment) => `${comment.path}:${comment.line}\n${comment.body}`).join("\n\n");
	return `${opening}\n${notes}\nRead every comment: trellis review list ${input.url}\nApply what each comment asks. Answer each comment.`;
};

// A change in the GitHub checks of the pull request of an agent. `headSha`
// is the commit the checks ran on, so the agent can tell whether its newest
// push is the one that failed.
export const checkMessage = (input: {
	url: string;
	headSha: string;
	kind: CheckNoticeKind;
	checks: NoticeCheck[];
	isQueued?: boolean;
}) => {
	const commit = input.headSha.slice(0, 7);
	if (input.kind === "passed") return `trellis: every check passed on commit ${commit} of ${input.url}.`;
	const count = input.checks.length;
	const noun = count === 1 ? "check" : "checks";
	const opening =
		input.kind === "failed"
			? `trellis: ${count} ${noun} failed on commit ${commit} of ${input.url}.`
			: `trellis: ${count} ${noun} on commit ${commit} of ${input.url} stayed pending for ${STUCK_MS / 60_000} minutes with no change.`;
	const checks = input.checks.map((check) => {
		const name = check.workflow === null ? check.name : `${check.workflow} / ${check.name}`;
		const head = check.link === null ? name : `${name}: ${check.link}`;
		return [head, ...check.lines.map((line) => `  ${line}`)].join("\n");
	});
	const close =
		input.kind === "failed"
			? "Read the log, fix the cause, and push. Trellis tells you when every check passes."
			: "Open the check on GitHub to find what it waits for.";
	const queueBlock =
		input.kind === "failed" && input.isQueued
			? count === 1
				? "This failed check blocks the pull request in the merge queue."
				: "These failed checks block the pull request in the merge queue."
			: null;
	return `${opening}\n${[queueBlock, ...checks].filter((line) => line !== null).join("\n")}\n${close}`;
};

export const queueMessage = (input: { url: string; kind: QueueNoticeKind; queuePosition: number | null }) => {
	if (input.kind === "merged") return `trellis: your pull request merged from the merge queue: ${input.url}.`;
	if (input.kind === "dequeued") return `trellis: GitHub removed your pull request from the merge queue: ${input.url}.`;
	const position = input.queuePosition === null ? "" : ` at position ${input.queuePosition}`;
	return `trellis: your pull request entered the merge queue${position}: ${input.url}.`;
};

// A change in the merge state of the pull request of an agent: a `conflict`
// notice or a `clear` notice. GitHub does not name the conflicting files in
// the poll answer, so the agent finds them with the merge.
export const conflictMessage = (input: { url: string; baseRef: string; headSha: string; kind: CheckNoticeKind }) => {
	const commit = input.headSha.slice(0, 7);
	if (input.kind === "clear")
		return `trellis: the merge conflict of ${input.url} is gone. Commit ${commit} merges into ${input.baseRef} with no conflict.`;
	return [
		`trellis: ${input.url} has a merge conflict with the base branch ${input.baseRef} on commit ${commit}.`,
		`Merge the base branch into your branch: git fetch origin && git merge origin/${input.baseRef}`,
		"Resolve each conflict, run the tests, commit, and push. Trellis tells you when the conflict is gone.",
	].join("\n");
};
