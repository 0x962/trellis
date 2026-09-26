import type { PageCommentThread } from "@trellis/api";

export type NumberedPageComment = { number: number; thread: PageCommentThread };

export const numberPageComments = (threads: PageCommentThread[]): NumberedPageComment[] =>
	threads.map((thread, index) => ({ number: index + 1, thread }));

export const visiblePageComments = (threads: NumberedPageComment[], showResolved: boolean) =>
	threads.filter(({ thread }) => showResolved || thread.resolved === null);

export const pageCommentPins = (threads: NumberedPageComment[], version: number, showResolved: boolean) =>
	visiblePageComments(threads, showResolved).filter(({ thread }) => thread.version === version);

export const pageCommentSearch = (version: number, latestVersion: number) =>
	version === latestVersion ? {} : { version };
