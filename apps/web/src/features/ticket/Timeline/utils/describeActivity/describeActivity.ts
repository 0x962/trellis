import { type Activity, activityActions } from "@trellis/api";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// `https://github.com/acme/web/pull/118` reads as `web #118`.
const prShort = (url: string) => {
	const match = /\/([^/]+)\/pull\/(\d+)/.exec(url);
	return match === null ? url : `${match[1]} #${match[2]}`;
};

const metaText = (item: Activity, key: string) => String(item.meta[key] ?? "");

// A PR, attachment, or comment row has no field. Its action names what
// happened, and its `meta` holds the URL or the file name.
const byAction: Record<string, (item: Activity) => string> = {
	[activityActions.created]: () => "created the ticket",
	"pr.linked": (item) => `linked the PR ${prShort(metaText(item, "url"))}`,
	"pr.unlinked": (item) => `removed the PR ${prShort(metaText(item, "url"))}`,
	"attachment.created": (item) => `attached ${metaText(item, "filename")}`,
	"attachment.deleted": (item) => `removed ${metaText(item, "filename")}`,
	"comment.updated": () => "edited a comment",
	"comment.deleted": () => "deleted a comment",
};

// One activity row as a verb phrase: "moved the ticket from Todo to In
// Progress". The action decides first, then the field.
export const describeActivity = (item: Activity): string => {
	const action = byAction[item.action];
	if (action !== undefined) return action(item);
	switch (item.field) {
		case "status":
			return `moved the ticket from ${item.fromValue} to ${item.toValue}`;
		case "priority":
			return `set the priority to ${capitalize(item.toValue ?? "none")}`;
		case "title":
			return "renamed the ticket";
		case "description":
			return "edited the description";
		case "parent":
			return item.toValue === null ? "removed the parent" : `set the parent to ${item.toValue}`;
		case "project":
			return `moved the ticket to ${(item.toValue ?? "").replaceAll(".", "/")}`;
		case "position":
			return "moved the ticket in the column";
		default:
			return `changed the ${item.field ?? "ticket"}`;
	}
};

const oxford = (words: string[]) => {
	if (words.length <= 1) return words.join("");
	if (words.length === 2) return `${words[0]} and ${words[1]}`;
	return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
};

// A run of rows as one phrase: "changed the status and priority, and
// linked the PR web #118". Field names form one list after "changed the";
// every other row keeps its own verb phrase.
export const describeRun = (items: readonly Activity[]): string => {
	const fields: string[] = [];
	const others: string[] = [];
	for (const item of items) {
		if (byAction[item.action] !== undefined || item.field === null) others.push(describeActivity(item));
		else if (item.field !== "position" && !fields.includes(item.field)) fields.push(item.field);
	}
	const changed = fields.length === 0 ? [] : [`changed the ${oxford(fields)}`];
	if (changed.length === 1 && others.length > 0) return `${changed[0]}, and ${oxford(others)}`;
	return oxford([...changed, ...others]);
};
