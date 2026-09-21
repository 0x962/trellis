import type { TimelineItem } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { cell, type ListSpec, renderTable } from "./output.ts";

// Activity keeps the wire order: newest first.
export const activityList: ListSpec<TimelineItem> = {
	columns: [
		{ name: "at", value: (row) => shortZonedDateTime(row.createdAt) },
		{ name: "actor", value: (row) => `${row.actor.kind}:${row.actor.displayName ?? row.actor.name}` },
		{ name: "action", value: (row) => row.action },
		{ name: "field", value: (row) => cell(row.field) },
		{ name: "change", value: (row) => (row.field === null ? "-" : `${cell(row.fromValue)} -> ${cell(row.toValue)}`) },
	],
	identifier: (row) => String(row.id),
};

export const renderActivity = (activity: TimelineItem[]): string => renderTable(activity, activityList.columns);
