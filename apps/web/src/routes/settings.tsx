import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsView } from "../features/settings/SettingsView";
import { settingsBehind, settingsEntry } from "../features/settings/settingsUrl";
import { readActor } from "../lib/actor";
import { canOpenDesktopSettingsBeforeSetup, type DesktopBridge } from "../lib/desktopBridge";
import { pageSheetActions } from "../stores/pageSheetStore";

const beforeSetup = (pathname: string, hash: string) => {
	const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
	return readActor() === null && canOpenDesktopSettingsBeforeSetup(desktop, pathname, hash);
};

// The settings URL. The settings are a sheet now, so this route opens that
// sheet over `settingsBehind` and hands the person a page to stay on when
// they close it. The desktop app before the first run is the one case that
// still draws a page here, because that run mounts no sheet stack.
export const Route = createFileRoute("/settings")({
	beforeLoad: ({ location }) => {
		const entry = settingsEntry(location.hash, beforeSetup(location.pathname, location.hash));
		if (entry.draw === "page") return;
		pageSheetActions.openSettings(entry.section);
		throw redirect({ to: settingsBehind, replace: true });
	},
	component: SettingsBeforeSetup,
});

// The desktop settings while the person has no name yet. The nav holds the
// one desktop section, so the state below only ever holds that section.
function SettingsBeforeSetup() {
	const hash = useLocation({ select: (location) => location.hash });
	const [section, setSection] = useState(settingsEntry(hash, true).section);
	return <SettingsView section={section} onSectionChange={setSection} />;
}
