import type { Activity, Comment, TimelineItem } from "@trellis/api";
import { cell, type ListSpec, renderTable } from "./output.ts";

export type CommentItem = Comment & { kind: "comment" };
export type ActivityItem = Activity & { kind: "activity" };

export const commentItems = (items: TimelineItem[]): CommentItem[] =>
	items.filter((item): item is CommentItem => item.kind === "comment");

export const activityItems = (items: TimelineItem[]): ActivityItem[] =>
	items.filter((item): item is ActivityItem => item.kind === "activity");

// A thread reads oldest first, so the comment blocks print in reverse of
// the wire order. Each block names its comment and parent for a CLI reply.
export const renderComments = (comments: CommentItem[]): string =>
	[...comments]
		.reverse()
		.map((comment) => {
			const state = comment.resolvedAt ? " [resolved]" : "";
			const parent = comment.parentId ? ` reply to ${comment.parentId}` : "";
			return `${comment.id}${state}${parent}\n${comment.actor.kind}:${comment.actor.displayName ?? comment.actor.name}  ${comment.createdAt}\n${comment.body}\n\n`;
		})
		.join("");

export const commentList: ListSpec<CommentItem> = {
	columns: [
		{ name: "id", value: (row) => row.id },
		{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.displayName ?? row.actor.name}` },
		{ name: "created", value: (row) => row.createdAt },
		{ name: "body", value: (row) => cell(row.body) },
	],
	identifier: (row) => row.id,
};

// Activity keeps the wire order: newest first.
export const activityList: ListSpec<ActivityItem> = {
	columns: [
		{ name: "at", value: (row) => row.createdAt },
		{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.displayName ?? row.actor.name}` },
		{ name: "action", value: (row) => row.action },
		{ name: "field", value: (row) => cell(row.field) },
		{ name: "change", value: (row) => (row.field === null ? "-" : `${cell(row.fromValue)} -> ${cell(row.toValue)}`) },
	],
	identifier: (row) => String(row.id),
};

export const renderActivity = (activity: ActivityItem[]): string => renderTable(activity, activityList.columns);
