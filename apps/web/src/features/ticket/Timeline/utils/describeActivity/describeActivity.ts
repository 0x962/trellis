import type { Activity } from "@trellis/api";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// `canary-technologies-corp/de#118` reads as `de #118`.
const prShort = (value: string) => {
	const match = /^(?:[^/]+\/)?([^#]+)#(\d+)$/.exec(value);
	return match === null ? value : `${match[1]} #${match[2]}`;
};

// One activity row as a verb phrase: "moved Todo → In Progress".
export const describeActivity = (item: Activity): string => {
	if (item.action === "created") return "created the ticket";
	switch (item.field) {
		case "status":
			return `moved ${item.fromValue} → ${item.toValue}`;
		case "priority":
			return `set priority ${capitalize(item.toValue ?? "none")}`;
		case "pr":
			return item.toValue === null ? `unlinked ${prShort(item.fromValue ?? "")}` : `linked ${prShort(item.toValue)}`;
		case "title":
			return "renamed the ticket";
		case "description":
			return "edited the description";
		case "parent":
			return item.toValue === null ? "removed the parent" : `set parent ${item.toValue}`;
		case "project":
			return `moved to ${item.toValue}`;
		case "position":
			return "reordered the column";
		default:
			return `changed ${item.field ?? "the ticket"}`;
	}
};

const oxford = (words: string[]) => {
	if (words.length <= 1) return words.join("");
	if (words.length === 2) return `${words[0]} and ${words[1]}`;
	return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
};

// A run of rows as one phrase: "changed status, priority, and linked de #118".
export const describeRun = (items: readonly Activity[]): string => {
	const fields: string[] = [];
	const links: string[] = [];
	for (const item of items) {
		if (item.field === "pr") links.push(describeActivity(item));
		else if (item.field !== null && item.field !== "position" && !fields.includes(item.field)) fields.push(item.field);
	}
	const words = [...fields, ...links];
	return fields.length > 0 ? `changed ${oxford(words)}` : oxford(words);
};
