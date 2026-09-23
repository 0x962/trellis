// The part of the settings of one project that the nav on the left names.
// The general section is the one a URL with no section opens, and its id is
// the empty string.
export type ProjectSettingsSectionId = "" | "notes" | "template" | "statuses" | "labels" | "archive";

const sectionIds: readonly ProjectSettingsSectionId[] = ["", "notes", "template", "statuses", "labels", "archive"];

const isSectionId = (value: string): value is ProjectSettingsSectionId => sectionIds.some((id) => id === value);

// `/p/<KEY>/notes` always opens the notes section. `/p/<KEY>/settings`
// takes its section from the hash.
export const projectSettingsSection = (view: "settings" | "notes", hash: string): ProjectSettingsSectionId =>
	view === "notes" ? "notes" : isSectionId(hash) ? hash : "";
