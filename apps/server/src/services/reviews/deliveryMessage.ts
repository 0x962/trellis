import { type CheckNoticeKind, type NoticeCheck, STUCK_MS } from "../../gh/checkNotice.ts";

// What an agent reads in its terminal when a delivery reaches it.

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
export const checkMessage = (input: { url: string; headSha: string; kind: CheckNoticeKind; checks: NoticeCheck[] }) => {
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
	return `${opening}\n${checks.join("\n")}\n${close}`;
};
