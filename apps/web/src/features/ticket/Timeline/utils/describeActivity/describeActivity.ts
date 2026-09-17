import { type Activity, activityActions } from "@trellis/api";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// `https://github.com/acme/web/pull/118` reads as `web #118`.
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
	merge: (pr) => `merged the PR ${pr}`,
	"admin-merge": (pr) => `merged the PR ${pr}`,
	automerge: (pr) => `enabled auto-merge for the PR ${pr}`,
	"disable-automerge": (pr) => `disabled auto-merge for the PR ${pr}`,
	queue: (pr) => `added the PR ${pr} to the merge queue`,
	dequeue: (pr) => `removed the PR ${pr} from the merge queue`,
	close: (pr) => `closed the PR ${pr}`,
	ready: (pr) => `marked the PR ${pr} ready for review`,
	"update-branch": (pr) => `updated the branch for the PR ${pr}`,
	"deploy-on": (pr) => `enabled deploy on merge for the PR ${pr}`,
	"deploy-off": (pr) => `disabled deploy on merge for the PR ${pr}`,
	"live-create": (pr) => `requested a Live Branch for the PR ${pr}`,
	"live-deploy": (pr) => `requested a Live Branch deploy for the PR ${pr}`,
	"live-delete": (pr) => `requested Live Branch removal for the PR ${pr}`,
	"live-enable": (pr) => `enabled Live Branch on push for the PR ${pr}`,
	"live-disable": (pr) => `disabled Live Branch on push for the PR ${pr}`,
	"live-persist": (pr) => `kept the Live Branch after merge for the PR ${pr}`,
	"live-unpersist": (pr) => `removed Live Branch persistence for the PR ${pr}`,
};

// The poller writes a pull request row as "<state>/<ci state>", such as
// "open/pending". A row moves either the state or the checks, so the line
// names whichever one moved.
const prStateWords: Record<string, string> = {
	merged: "merged the pull request",
	closed: "closed the pull request",
	open: "reopened the pull request",
};
const prCheckWords: Record<string, string> = {
	pass: "the checks of the pull request passed",
	fail: "the checks of the pull request failed",
	pending: "the checks of the pull request are running",
	none: "the pull request has no checks",
};

// A PR, attachment, or comment row has no field. Its action names what
// happened, and its `meta` holds the URL or the file name.
const byAction: Record<string, (item: Activity) => string> = {
	[activityActions.created]: () => "created the ticket",
	"pr.linked": (item) => `linked the PR ${prShort(metaText(item, "url"))}`,
	"pr.unlinked": (item) => `removed the PR ${prShort(metaText(item, "url"))}`,
	"pr.reviewed": (item) =>
		`${reviewWords[metaText(item, "action")] ?? "reviewed"} the PR ${prShort(metaText(item, "url"))}`,
	"pr.actioned": (item) => {
		const pr = prShort(metaText(item, "url"));
		return (prActionWords[metaText(item, "action")] ?? ((value) => `updated the PR ${value}`))(pr);
	},
	"pr.state_changed": (item) => {
		const [fromState] = metaText(item, "from").split("/");
		const [toState, toChecks] = metaText(item, "to").split("/");
		const words = toState === fromState ? prCheckWords[toChecks ?? ""] : prStateWords[toState ?? ""];
		return words ?? "changed the pull request";
	},
	"attachment.created": (item) => `attached ${metaText(item, "filename")}`,
	"attachment.deleted": (item) => `removed ${metaText(item, "filename")}`,
	"comment.updated": (item) => {
		if (item.meta.resolved === true) return "resolved a comment thread";
		if (item.meta.resolved === false) return "reopened a comment thread";
		return "edited a comment";
	},
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
