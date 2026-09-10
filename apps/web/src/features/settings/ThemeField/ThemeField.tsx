import { Select, type ThemeMode } from "@trellis/ui";
import { useTheme } from "../../../lib/theme";
import { SettingsRow } from "../SettingsRow";

const themes: { value: ThemeMode; label: string }[] = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

// The theme choice: System, Light, or Dark. Dark is what a first run gets.
export function ThemeField() {
	const { mode, setTheme } = useTheme();
	return (
		<SettingsRow label="Theme" hint="System follows the operating system.">
			<Select label="Theme" items={themes} value={mode} onValueChange={setTheme} className="max-w-64" />
		</SettingsRow>
	);
}
