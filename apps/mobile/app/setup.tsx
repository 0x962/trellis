import { parsePairLink } from "@trellis/api";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { KeyValueRow } from "../src/components/KeyValueRow";
import { QrScanner } from "../src/features/setup/QrScanner";
import { queryClient } from "../src/lib/queryClient";
import { actorHeader, type ProbeResult, probeHealth, validateActorName, validateServerUrl } from "../src/lib/server";
import { keys } from "../src/lib/store";
import { useStoredString } from "../src/lib/useStoredString";
import { tokens } from "../src/theme/tokens";
import { usePalette } from "../src/theme/usePalette";

// A probe answer and the URL it asked. The person can edit the field while a
// probe is in flight, so the answer counts only for the URL it asked.
type Probe = { url: string; result: ProbeResult };

// The name the probe sends while the Name field is empty.
const anonymous = "setup";

const notPairLink = "This QR code is not a trellis pair link.";

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

// Where the server is and who the person is. The URL comes from the field,
// from a scan of the QR code on the web settings page, or from the pair link
// as the `url` parameter. A scan and a pair link fill the field and probe it.
// Save needs a probe that succeeded for the URL in the field and a name the
// actor header grammar takes. After Save the screen returns to where it was
// opened from, or to the first tab on a fresh install.
export default function SetupScreen() {
	const [storedUrl, setStoredUrl] = useStoredString(keys.serverUrl);
	const [storedName, setStoredName] = useStoredString(keys.actorName);
	const { url: linkedUrl } = useLocalSearchParams<{ url?: string }>();
	const [url, setUrl] = useState(storedUrl ?? "http://");
	const [name, setName] = useState(storedName ?? "");
	const [error, setError] = useState<string>();
	const [probe, setProbe] = useState<Probe>();
	const [busy, setBusy] = useState(false);
	const [scanning, setScanning] = useState(false);
	// How many times the person pressed Save. The screen leaves on a press
	// that stored both values, so it counts the presses instead of holding a
	// flag that stays true after the first one.
	const [saves, setSaves] = useState(0);
	const palette = usePalette();
	const configured = Boolean(storedUrl) && Boolean(storedName);

	useEffect(() => {
		if (saves === 0 || !configured) return;
		if (router.canGoBack()) router.back();
		else router.replace("/");
	}, [saves, configured]);

	const changeUrl = (next: string) => {
		setUrl(next);
		setProbe(undefined);
		setError(undefined);
	};

	const current = validateServerUrl(url);
	const validName = validateActorName(name);
	// The answer for the URL in the field. Another URL's answer shows nothing
	// and approves nothing.
	const answer = current.ok && probe?.url === current.url ? probe.result : undefined;
	// The Name field holds a name the server refuses. An empty field is the
	// start of the screen and carries no message.
	const nameNote = name.trim() !== "" && !validName.ok ? validName.error : undefined;

	const testConnection = async (target: string) => {
		const valid = validateServerUrl(target);
		if (!valid.ok) {
			setError(valid.error);
			return;
		}
		// The Name field carries the message for a name outside the grammar,
		// so the press stops here and shows nothing new.
		const actor = validateActorName(name.trim() === "" ? anonymous : name);
		if (!actor.ok) return;
		setError(undefined);
		setBusy(true);
		const result = await probeHealth(valid.url, actorHeader(actor.name));
		setProbe({ url: valid.url, result });
		setBusy(false);
	};

	const fill = (next: string) => {
		changeUrl(next);
		void testConnection(next);
	};

	// A pair link that opens the app, or a new one while this screen stays
	// mounted, fills the field once per URL.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `fill` is a new function on every render, and the effect runs for a new URL only.
	useEffect(() => {
		if (linkedUrl !== undefined) fill(linkedUrl);
	}, [linkedUrl]);

	const openScanner = () => {
		setError(undefined);
		setScanning(true);
	};

	const scanned = (data: string) => {
		setScanning(false);
		const server = parsePairLink(data);
		if (server === null) setError(notPairLink);
		else fill(server);
	};

	// The Save button is disabled until `canSave`, which needs both results
	// below. The two checks give the compiler the URL and the name.
	const save = () => {
		if (!current.ok || !validName.ok) return;
		// The cache holds the other server's tickets. They are not rows of the
		// server the person saves, so the app starts empty on it.
		if (current.url !== storedUrl) queryClient.clear();
		setStoredUrl(current.url);
		setStoredName(validName.name);
		setSaves((count) => count + 1);
	};

	const canSave = answer?.ok === true && validName.ok;

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
				note="Scan the code under Pair a phone in the web settings, or type the address the server prints at start."
			/>
			{scanning ? (
				<QrScanner onScan={scanned} onCancel={() => setScanning(false)} />
			) : (
				<Button label="Scan QR code" onPress={openScanner} />
			)}
			<Button label={busy ? "Testing…" : "Test connection"} onPress={() => void testConnection(url)} disabled={busy} />
			{error !== undefined && <Text style={[styles.message, { color: palette.danger }]}>{error}</Text>}
			{answer !== undefined && !answer.ok && (
				<Text style={[styles.message, { color: palette.danger }]}>{failureMessage(answer)}</Text>
			)}
			{answer?.ok && (
				<View style={[styles.card, { backgroundColor: palette.surface }]}>
					<KeyValueRow label="Version" value={answer.version} />
					<KeyValueRow label="Tickets" value={`${answer.ticketCount} tickets`} />
					<KeyValueRow label="Server says you are" value={answer.actorName} />
				</View>
			)}
			<Field
				label="Name"
				value={name}
				onChangeText={setName}
				placeholder="dana"
				autoCapitalize="none"
				autoCorrect={false}
				note={nameNote}
			/>
			<Button label="Save" onPress={save} disabled={!canSave} variant="primary" />
		</ScrollView>
	);
}
