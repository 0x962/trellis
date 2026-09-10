import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";

export type ImageViewerProps = {
	// The absolute file URL.
	url: string;
	filename: string;
	onClose: () => void;
};

const styles = StyleSheet.create({
	screen: { flex: 1, justifyContent: "center" },
	image: { width: "100%", flex: 1 },
	name: {
		position: "absolute",
		left: tokens.space[4],
		right: tokens.space[4],
		textAlign: "center",
		fontSize: tokens.text.sm,
		lineHeight: tokens.leading.sm,
	},
	close: {
		position: "absolute",
		right: tokens.space[2],
		minWidth: layout.hit,
		height: layout.hit,
		alignItems: "center",
	},
	closeGlyph: { fontSize: tokens.text.xl, lineHeight: layout.hit },
});

// One image over the whole screen, fit inside it. A tap anywhere closes it.
// The parent mounts it while an image is open.
export function ImageViewer({ url, filename, onClose }: ImageViewerProps) {
	const palette = usePalette();
	const { top, bottom } = useSafeAreaInsets();
	return (
		<Modal visible animationType="fade" onRequestClose={onClose}>
			<Pressable onPress={onClose} style={[styles.screen, { backgroundColor: palette.bg }]}>
				<Image source={{ uri: url }} contentFit="contain" style={styles.image} accessibilityLabel={filename} />
				<Text numberOfLines={1} style={[styles.name, { color: palette.fgMuted, bottom: bottom + tokens.space[4] }]}>
					{filename}
				</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Close"
					onPress={onClose}
					style={[styles.close, { top }]}
				>
					<Text style={[styles.closeGlyph, { color: palette.fg }]}>×</Text>
				</Pressable>
			</Pressable>
		</Modal>
	);
}
