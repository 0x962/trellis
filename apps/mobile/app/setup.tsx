import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { KeyValueRow } from "../src/components/KeyValueRow";
import { type ProbeResult, probeHealth, validateServerUrl } from "../src/lib/server";
import { actorHeader, keys, store } from "../src/lib/store";
import { tokens } from "../src/theme/tokens";
import { usePalette } from "../src/theme/usePalette";

const failureMessage = (result: Exclude<ProbeResult, { ok: true }>) => {
	if (result.kind === "timeout") return "Timed out after 3 s";
	if (result.kind === "unreachable") return `Unreachable: ${result.detail}`;
	return "Not a trellis server";
};

const styles = StyleSheet.create({
	page: { gap: tokens.space[4], padding: tokens.space[4] },
	message: { fontSize: tokens.text.base, lineHeight: tokens.leading.base },
	card: { borderRadius: tokens.radius.lg, overflow: "hidden" },
});

// Where the server is and who the person is. Save needs a probe that
// succeeded for the URL in the field and a name. After Save the screen
// returns to where it was opened from, or to the first tab on a fresh install.
export default function SetupScreen() {
	const [storedUrl, setStoredUrl] = useMMKVString(keys.serverUrl, store);
	const [storedName, setStoredName] = useMMKVString(keys.actorName, store);
	const [url, setUrl] = useState(storedUrl ?? "http://");
	const [name, setName] = useState(storedName ?? "");
	const [error, setError] = useState<string>();
	const [probe, setProbe] = useState<ProbeResult>();
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState(false);
	const palette = usePalette();
	const configured = Boolean(storedUrl) && Boolean(storedName);

	useEffect(() => {
		if (!saved || !configured) return;
		if (router.canGoBack()) router.back();
		else router.replace("/");
	}, [saved, configured]);

	const changeUrl = (next: string) => {
		setUrl(next);
		setProbe(undefined);
		setError(undefined);
	};

	const testConnection = async () => {
		const valid = validateServerUrl(url);
		if (!valid.ok) {
			setError(valid.error);
			return;
		}
		setError(undefined);
		setBusy(true);
		setProbe(await probeHealth(valid.url, actorHeader(name.trim() || "setup")));
		setBusy(false);
	};

	const save = () => {
		const valid = validateServerUrl(url);
		if (!valid.ok) return;
		setStoredUrl(valid.url);
		setStoredName(name.trim());
		setSaved(true);
	};

	const canSave = probe?.ok === true && name.trim().length > 0;

	return (
		<ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
			<Field
				label="Server URL"
				value={url}
				onChangeText={changeUrl}
				placeholder="http://192.168.1.20:4521"
				keyboardType="url"
				autoCapitalize="none"
				autoCorrect={false}
				mono
				note="The address the trellis server prints at start."
			/>
			<Button label={busy ? "Testing…" : "Test connection"} onPress={() => void testConnection()} disabled={busy} />
			{error !== undefined && <Text style={[styles.message, { color: palette.danger }]}>{error}</Text>}
			{probe !== undefined && !probe.ok && (
				<Text style={[styles.message, { color: palette.danger }]}>{failureMessage(probe)}</Text>
			)}
			{probe?.ok && (
				<View style={[styles.card, { backgroundColor: palette.surface }]}>
					<KeyValueRow label="Version" value={probe.version} mono />
					<KeyValueRow label="Tickets" value={`${probe.ticketCount} tickets`} />
					<KeyValueRow label="Server says you are" value={probe.actorName} />
				</View>
			)}
			<Field
				label="Name"
				value={name}
				onChangeText={setName}
				placeholder="navid"
				autoCapitalize="none"
				autoCorrect={false}
			/>
			<Button label="Save" onPress={save} disabled={!canSave} variant="primary" />
		</ScrollView>
	);
}
