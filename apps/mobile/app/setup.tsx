import { parsePairLink } from "@trellis/api";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { KeyValueRow } from "../src/components/KeyValueRow";
import { Spinner } from "../src/components/Spinner";
import { QrScanner } from "../src/features/setup/QrScanner";
import { setupFeedback, setupNameError, setupNameNote } from "../src/features/setup/setupFeedback";
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

const styles = StyleSheet.create({
	page: { gap: tokens.space[4], padding: tokens.space[4], paddingBottom: tokens.space[8] },
	intro: { fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	feedback: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
	message: { flex: 1, fontSize: tokens.text.base, lineHeight: tokens.leading.base },
	card: { borderRadius: tokens.radius.lg, overflow: "hidden" },
});

// Where the server is and who the person is. The URL comes from the field,
// a QR code that contains a server URL, or the pair link's `url` parameter.
// A scan and a pair link fill the field and probe it.
// Save needs a probe that succeeded for the URL in the field and a name the
// actor header grammar takes. After Save the screen returns to where it was
// opened from, or to the first tab on a fresh install.
export default function SetupScreen() {
	const [storedUrl, setStoredUrl] = useStoredString(keys.serverUrl);
	const [storedName, setStoredName] = useStoredString(keys.actorName);
	const { url: linkedUrl } = useLocalSearchParams<{ url?: string }>();
	const [url, setUrl] = useState(storedUrl ?? "http://");
	const [name, setName] = useState(storedName ?? "");
	const [urlError, setUrlError] = useState<string>();
	const [invalidPairLink, setInvalidPairLink] = useState(false);
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
		setUrlError(undefined);
		setInvalidPairLink(false);
	};

	const current = validateServerUrl(url);
	const validName = validateActorName(name);
	// The answer for the URL in the field. Another URL's answer shows nothing
	// and approves nothing.
	const answer = current.ok && probe?.url === current.url ? probe.result : undefined;
	const nameError = setupNameError({
		name,
		validationError: validName.ok ? undefined : validName.error,
		revealEmpty: answer?.ok === true,
	});

	const testConnection = async (target: string) => {
		const valid = validateServerUrl(target);
		if (!valid.ok) {
			setUrlError(valid.error);
			return;
		}
		// The Name field carries the message for a name outside the grammar,
		// so the press stops here and shows nothing new.
		const actor = validateActorName(name.trim() === "" ? anonymous : name);
		if (!actor.ok) return;
		setUrlError(undefined);
		setInvalidPairLink(false);
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
		setInvalidPairLink(false);
		setScanning(true);
	};

	const scanned = (data: string) => {
		setScanning(false);
		const server = parsePairLink(data);
		if (server === null) setInvalidPairLink(true);
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

	const feedback = scanning ? undefined : setupFeedback({ busy, invalidPairLink, answer });
	const connected = feedback?.tone === "success" && answer?.ok === true;
	const replacingServer = current.ok && storedUrl !== undefined && current.url !== storedUrl;
	const canSave = connected && validName.ok && !busy;
	const feedbackColor =
		feedback?.tone === "danger" ? palette.danger : feedback?.tone === "success" ? palette.success : palette.fgMuted;

	return (
		<ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
			<Text style={[styles.intro, { color: palette.fgMuted }]}>
				Connect this phone to the Trellis server on your computer. Test the server before you save it.
			</Text>
			<Field
				label="Server URL"
				value={url}
				onChangeText={changeUrl}
				placeholder="http://192.168.1.20:4521"
				keyboardType="url"
				autoCapitalize="none"
				autoCorrect={false}
				returnKeyType="go"
				onSubmitEditing={() => void testConnection(url)}
				error={urlError}
				note="Scan the pair code from Trellis settings, or enter the address that Trellis prints at start."
			/>
			{scanning ? (
				<QrScanner onScan={scanned} onCancel={() => setScanning(false)} />
			) : (
				<Button
					label="Scan pair code"
					accessibilityHint="Uses the camera to read a Trellis pair code."
					onPress={openScanner}
				/>
			)}
			<Button
				label={busy ? "Testing connection…" : "Test connection"}
				accessibilityHint="Checks that this address responds as a Trellis server."
				onPress={() => void testConnection(url)}
				disabled={busy}
			/>
			<Field
				label="Your name"
				value={name}
				onChangeText={setName}
				placeholder="dana"
				autoCapitalize="none"
				autoCorrect={false}
				returnKeyType="done"
				onSubmitEditing={canSave ? save : undefined}
				error={nameError}
				note={setupNameNote(replacingServer)}
			/>
			<Button
				label="Save server"
				accessibilityHint="Saves the verified server and your name on this phone."
				onPress={save}
				disabled={!canSave}
				variant="primary"
			/>
			{feedback !== undefined && (
				<View style={styles.feedback}>
					{busy && <Spinner />}
					<Text
						accessibilityLiveRegion={feedback.tone === "danger" ? "assertive" : "polite"}
						accessibilityRole={feedback.tone === "danger" ? "alert" : undefined}
						style={[styles.message, { color: feedbackColor }]}
					>
						{feedback.message}
					</Text>
				</View>
			)}
			{connected && (
				<View style={[styles.card, { backgroundColor: palette.surface }]}>
					<KeyValueRow label="Version" value={answer.version} />
					<KeyValueRow label="Tickets" value={`${answer.ticketCount} tickets`} />
					<KeyValueRow label="Server default actor" value={answer.actorName} />
				</View>
			)}
		</ScrollView>
	);
}
