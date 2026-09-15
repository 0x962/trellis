import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { Button } from "../Button";

export type UnreachableServerProps = {
	// The stored server without its scheme, such as 192.168.1.20:4521.
	host: string;
	onRetry: () => void;
	onChangeServer: () => void;
};

const styles = StyleSheet.create({
	box: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space[3], padding: tokens.space[6] },
	title: { fontSize: tokens.text.lg, lineHeight: tokens.leading.lg, fontWeight: "600", textAlign: "center" },
	hint: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, textAlign: "center" },
	actions: { alignSelf: "stretch", gap: tokens.space[2], marginTop: tokens.space[3] },
});

// The whole screen when the server does not answer and the cache holds no
// data. Retry asks the server again; Change server opens the setup screen.
export function UnreachableServer({ host, onRetry, onChangeServer }: UnreachableServerProps) {
	const palette = usePalette();
	return (
		<View style={styles.box}>
			<Ionicons name="cloud-offline-outline" size={tokens.space[10]} color={palette.fgFaint} />
			<Text style={[styles.title, { color: palette.fg }]}>Cannot reach {host}</Text>
			<Text style={[styles.hint, { color: palette.fgMuted }]}>
				Check that the trellis server runs and that this phone is on the same network.
			</Text>
			<View style={styles.actions}>
				<Button label="Retry" onPress={onRetry} variant="primary" />
				<Button label="Change server" onPress={onChangeServer} />
			</View>
		</View>
	);
}
