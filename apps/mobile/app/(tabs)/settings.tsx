import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Button } from "../../src/components/Button";
import { KeyValueRow } from "../../src/components/KeyValueRow";
import { Segmented } from "../../src/components/Segmented";
import { keys, store } from "../../src/lib/store";
import { tokens } from "../../src/theme/tokens";
import { usePalette } from "../../src/theme/usePalette";
import { type ThemeMode, useTheme } from "../../src/theme/useTheme";

// The CLI command that sets a machine up to serve trellis.
export const installCommand = "trellis install";

const themeOptions: ReadonlyArray<{ value: ThemeMode; label: string }> = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

const styles = StyleSheet.create({
	section: { gap: tokens.space[2], paddingHorizontal: tokens.space[4], paddingVertical: tokens.space[3] },
	label: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontWeight: "500" },
	note: { fontSize: tokens.text.base, lineHeight: tokens.leading.base },
});

export default function SettingsScreen() {
	const [url] = useMMKVString(keys.serverUrl, store);
	const [name] = useMMKVString(keys.actorName, store);
	const { mode, setTheme } = useTheme();
	const palette = usePalette();
	return (
		<ScrollView>
			<KeyValueRow label="Name" value={name ?? ""} />
			<KeyValueRow label="Server" value={url ?? ""} mono onPress={() => router.push("/setup")} />
			<View style={styles.section}>
				<Text style={[styles.label, { color: palette.fgMuted }]}>Theme</Text>
				<Segmented options={themeOptions} value={mode} onChange={setTheme} />
			</View>
			<KeyValueRow label="Version" value={Constants.expoConfig?.version ?? ""} mono />
			<View style={styles.section}>
				<Button label="Copy trellis install command" onPress={() => void Clipboard.setStringAsync(installCommand)} />
				<Text style={[styles.note, { color: palette.fgMuted }]}>Notifications: not yet</Text>
			</View>
		</ScrollView>
	);
}
