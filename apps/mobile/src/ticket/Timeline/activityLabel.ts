import { type Activity, activityActions } from "@trellis/api";

const priorityNames: Record<string, string> = {
	none: "None",
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

// The repo name and the number of a pull request URL, as one short label.
const prShort = (url: string) => {
	const match = /\/([^/]+)\/pull\/(\d+)/.exec(url);
	return match === null ? url : `${match[1]} #${match[2]}`;
};

const metaText = (item: Activity, key: string) => String(item.meta[key] ?? "");

const reviewWords: Record<string, string> = {
	comment: "commented on",
	approve: "approved",
	request_changes: "requested changes on",
};

const prActionWords: Record<string, (pr: string) => string> = {
	merge: (pr) => `merged PR ${pr}`,
	"admin-merge": (pr) => `merged PR ${pr}`,
	automerge: (pr) => `enabled auto-merge for PR ${pr}`,
	"disable-automerge": (pr) => `disabled auto-merge for PR ${pr}`,
	queue: (pr) => `added PR ${pr} to the merge queue`,
	dequeue: (pr) => `removed PR ${pr} from the merge queue`,
	close: (pr) => `closed PR ${pr}`,
	ready: (pr) => `marked PR ${pr} ready for review`,
	"update-branch": (pr) => `updated the branch for PR ${pr}`,
};

// A comment, an attachment, and a pull request row carry no field. The
// action names what happened, and `meta` holds the URL, the file name, or
// the two states. The map keys are the action names the server writes.
const byAction: Record<string, (item: Activity) => string> = {
	[activityActions.created]: () => "created the ticket",
	"pr.linked": (item) => `linked PR ${prShort(metaText(item, "url"))}`,
	"pr.unlinked": (item) => `unlinked PR ${prShort(metaText(item, "url"))}`,
	"pr.reviewed": (item) =>
		`${reviewWords[metaText(item, "action")] ?? "reviewed"} PR ${prShort(metaText(item, "url"))}`,
	"pr.actioned": (item) => {
		const pr = prShort(metaText(item, "url"));
		return (prActionWords[metaText(item, "action")] ?? ((value) => `updated PR ${value}`))(pr);
	},
	"pr.state_changed": (item) => `PR ${metaText(item, "from")} → ${metaText(item, "to")}`,
	"attachment.created": (item) => `attached ${metaText(item, "filename")}`,
	"attachment.deleted": (item) => `removed ${metaText(item, "filename")}`,
	"comment.updated": (item) => {
		if (item.meta.resolved === true) return "resolved a comment thread";
		if (item.meta.resolved === false) return "reopened a comment thread";
		return "edited a comment";
	},
	"comment.deleted": () => "deleted a comment",
};

// The text of one activity line after the actor: "moved Todo → In Progress",
// "set priority High", "attached shot.png". The action decides first,
// because a row without a field carries its meaning there.
export const describeActivity = (item: Activity): string => {
	const phrase = byAction[item.action];
	if (phrase !== undefined) return phrase(item);
	switch (item.field) {
		case "status":
			return `moved ${item.fromValue} → ${item.toValue}`;
		case "priority":
			return `set priority ${priorityNames[item.toValue ?? "none"]}`;
		case "parent":
			return item.toValue === null ? "cleared the parent" : `set parent ${item.toValue}`;
		case "title":
			return "renamed the ticket";
		case "description":
			return "edited the description";
		case "project":
			return `moved to ${item.toValue}`;
		case "position":
			return "moved in the column";
		default:
			return `changed ${item.field ?? "the ticket"}`;
	}
};

// "a", "a and b", or "a, b, and c".
const joinPhrases = (phrases: string[]) => {
	if (phrases.length <= 1) return phrases.join("");
	if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
	return `${phrases.slice(0, -1).join(", ")}, and ${phrases.at(-1)}`;
};

// The text of a collapsed run: every changed field as one list, as in
// "changed priority and parent". A row the action names keeps its own
// phrase, because a field name says nothing about it.
export const describeRun = (items: readonly Activity[]): string => {
	const fields: string[] = [];
	const phrases: string[] = [];
	for (const item of items) {
		if (byAction[item.action] !== undefined || item.field === null) phrases.push(describeActivity(item));
		else if (!fields.includes(item.field)) fields.push(item.field);
	}
	const changed = fields.length === 0 ? [] : [`changed ${joinPhrases(fields)}`];
	return joinPhrases([...changed, ...phrases]);
};
