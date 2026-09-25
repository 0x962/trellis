// The part of the settings the nav on the left names. The account section
// is the one a URL with no section opens.
export type SettingsSectionId = "account" | "notifications" | "menu-links" | "desktop";

const sectionIds: readonly SettingsSectionId[] = ["account", "notifications", "menu-links", "desktop"];

const isSectionId = (value: string): value is SettingsSectionId => sectionIds.some((id) => id === value);

// The page the settings sheet stands over when a person opens the settings
// URL itself. Settings holds no page of its own any more, and this is the
// page a direct link falls back to everywhere else in the app.
export const settingsBehind = "/needs-you";

export type SettingsEntry = {
	// "sheet": open the settings sheet over `settingsBehind`.
	// "page": draw the settings as a plain page at the settings URL.
	draw: "sheet" | "page";
	section: SettingsSectionId;
};

// What the settings URL does. `beforeSetup` is true in the desktop app
// while the person has no name yet: the app draws no sidebar and mounts no
// sheet stack then, so the desktop section has to draw as a plain page.
export const settingsEntry = (hash: string, beforeSetup: boolean): SettingsEntry => ({
	draw: beforeSetup ? "page" : "sheet",
	section: isSectionId(hash) ? hash : "account",
});
