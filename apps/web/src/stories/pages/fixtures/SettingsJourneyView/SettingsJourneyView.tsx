import { useState } from "react";
import { SettingsView, type SettingsViewProps } from "../../../../features/settings/SettingsView";

export function SettingsJourneyView({ section: initial }: Pick<SettingsViewProps, "section">) {
	const [section, setSection] = useState(initial);
	return <SettingsView section={section} onSectionChange={setSection} />;
}
