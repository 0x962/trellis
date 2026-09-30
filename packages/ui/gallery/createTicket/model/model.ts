export type Scenario = "example" | "empty" | "failure";
export type Agent = "none" | "codex" | "claude";
export type Phase = "editing" | "creating" | "assigning" | "failed";
export type CreatedTicket = { id: string; title: string; assigned: boolean; agent: string; model: string };
export type Attachment = { id: string; name: string };

export const models = {
	none: [],
	codex: [
		{ value: "sol", label: "GPT-6 Sol" },
		{ value: "astra", label: "GPT-6 Astra" },
	],
	claude: [
		{ value: "opus", label: "Opus 5.5" },
		{ value: "sonnet", label: "Sonnet 5.5" },
	],
};

export const efforts = [
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
];

export const accounts = [
	{ value: "default", label: "Default account" },
	{ value: "work", label: "Work account" },
];

export const exampleTitle = "Add search to the ticket list";
export const exampleDescription =
	"Let people find tickets by title or identifier.\n\nKeep the search in the list header and preserve the current filters.";
