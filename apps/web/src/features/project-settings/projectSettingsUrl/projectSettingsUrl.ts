// The part of the settings of one project that the nav on the left names.
// The general section is the one a URL with no section opens, and its id is
// the empty string.
export type ProjectSettingsSectionId = "" | "notes" | "template" | "statuses" | "labels" | "archive";

// The sections in the order the nav prints them.
export const projectSettingsSections: readonly { id: ProjectSettingsSectionId; label: string }[] = [
	{ id: "", label: "General" },
	{ id: "notes", label: "Notes" },
	{ id: "template", label: "Ticket template" },
	{ id: "statuses", label: "Statuses" },
	{ id: "labels", label: "Labels" },
	{ id: "archive", label: "Danger Zone" },
];

const isSectionId = (value: string): value is ProjectSettingsSectionId =>
	projectSettingsSections.some((section) => section.id === value);

// The section that a project settings URL names. `/p/<KEY>/notes` is the
// notes section. `/p/<KEY>/settings` takes its section from the hash, and a
// hash that names no section opens the general section.
export const projectSettingsSection = (view: "settings" | "notes", hash: string): ProjectSettingsSectionId =>
	view === "notes" ? "notes" : isSectionId(hash) ? hash : "";
