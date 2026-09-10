import type { Activity } from "@trellis/api";

const priorityNames: Record<string, string> = {
	none: "None",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

// The text of one activity line after the actor: "moved Todo → In Progress",
// "set priority High", "linked PR <owner>/<repo>#<n>".
export const describeActivity = (item: Activity): string => {
	if (item.action === "created") return "created the ticket";
	switch (item.field) {
		case "status":
			return `moved ${item.fromValue} → ${item.toValue}`;
		case "priority":
			return `set priority ${priorityNames[item.toValue ?? "none"]}`;
		case "parent":
			return item.toValue === null ? "cleared the parent" : `set parent ${item.toValue}`;
		case "pr":
			return item.toValue === null ? "unlinked a PR" : `linked PR ${item.toValue}`;
		case "title":
			return "renamed the ticket";
		case "description":
			return "edited the description";
		case "project":
			return `moved to ${item.toValue}`;
		default:
			return `changed ${item.field}`;
	}
};

// "a and b", or "a, b, and c".
const joinFields = (fields: string[]) =>
	fields.length === 2 ? `${fields[0]} and ${fields[1]}` : `${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`;

// The text of a collapsed run: every distinct field, in order of first
// change, as in "changed priority and parent".
export const describeRun = (items: readonly Activity[]): string => {
	const fields = [...new Set(items.map((item) => item.field ?? item.action))];
	return `changed ${fields.length === 1 ? fields[0] : joinFields(fields)}`;
};
