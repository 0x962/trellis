import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { getOrpc } from "../../../../lib/orpc";
import { useServerReached } from "../../../../lib/reached";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";
import { inboxInput } from "../../utils/inboxCache";

export const offlineMessage = "Offline, showing cached data";

const styles = StyleSheet.create({
	banner: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: tokens.space[2],
		paddingHorizontal: tokens.space[4],
		paddingVertical: tokens.space[1] + tokens.space.half,
	},
	text: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontWeight: "500" },
});

// The amber line over restored rows. It renders while the inbox query holds
// cached data and no request has succeeded since the query client was made.
export function OfflineBanner() {
	const palette = usePalette();
	const reached = useServerReached();
	const inbox = useQuery(getOrpc().inbox.get.queryOptions({ input: inboxInput })).data;
	if (reached || inbox === undefined) return null;
	return (
		<View accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: palette.warningSoft }]}>
			<Ionicons name="cloud-offline-outline" size={tokens.text.md} color={palette.warning} />
			<Text style={[styles.text, { color: palette.warning }]}>{offlineMessage}</Text>
		</View>
	);
}
