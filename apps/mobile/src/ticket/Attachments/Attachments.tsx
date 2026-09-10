import Ionicons from "@expo/vector-icons/Ionicons";
import type { Attachment } from "@trellis/api";
import { Image } from "expo-image";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SectionHeader } from "../../components/SectionHeader";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { attachmentUrl, attachmentView } from "./attachmentView";
import { ImageViewer } from "./components/ImageViewer";

export type AttachmentsProps = {
	attachments: readonly Attachment[];
	// The stored server URL, which the relative attachment paths join.
	serverUrl: string;
};

const kilobyte = 1024;

// "184 KB", "3.8 MB".
const formatSize = (bytes: number) =>
	bytes < kilobyte * kilobyte ? `${Math.round(bytes / kilobyte)} KB` : `${(bytes / kilobyte / kilobyte).toFixed(1)} MB`;

const styles = StyleSheet.create({
	list: { paddingHorizontal: tokens.space[4], gap: tokens.space[2] },
	image: { width: "100%", height: layout.attachmentImage, borderRadius: tokens.radius.lg },
	caption: { fontSize: tokens.text.xs, lineHeight: tokens.leading.xs, marginTop: tokens.space[1] },
	file: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[3],
		minHeight: layout.hit,
		paddingHorizontal: tokens.space[3],
		borderRadius: tokens.radius.lg,
		borderWidth: layout.stroke,
	},
	name: { flex: 1, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	size: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontVariant: ["tabular-nums"] },
});

// An inline image renders with expo-image under `testID="attachment-image"`;
// a tap opens it over the whole screen. Every other file is a link named by
// its filename that opens the URL in the system browser.
export function Attachments({ attachments, serverUrl }: AttachmentsProps) {
	const palette = usePalette();
	const [viewing, setViewing] = useState<Attachment>();
	if (attachments.length === 0) return null;
	return (
		<View>
			<SectionHeader label="Attachments" count={attachments.length} />
			<View style={styles.list}>
				{attachments.map((attachment) => {
					const url = attachmentUrl(serverUrl, attachment);
					if (attachmentView(attachment) === "inline") {
						return (
							<Pressable key={attachment.id} accessibilityRole="imagebutton" onPress={() => setViewing(attachment)}>
								<Image
									testID="attachment-image"
									source={{ uri: url }}
									contentFit="cover"
									accessibilityLabel={attachment.filename}
									style={[styles.image, { backgroundColor: palette.surface }]}
								/>
								<Text numberOfLines={1} style={[styles.caption, { color: palette.fgMuted }]}>
									{attachment.filename} · {formatSize(attachment.size)}
								</Text>
							</Pressable>
						);
					}
					return (
						<Pressable
							key={attachment.id}
							accessibilityRole="link"
							onPress={() => void Linking.openURL(url)}
							style={({ pressed }) => [
								styles.file,
								{ backgroundColor: pressed ? palette.elevated : palette.surface, borderColor: palette.border },
							]}
						>
							<Ionicons name="document-outline" size={layout.statusIcon} color={palette.fgMuted} />
							<Text numberOfLines={1} style={[styles.name, { color: palette.fg }]}>
								{attachment.filename}
							</Text>
							<Text style={[styles.size, { color: palette.fgFaint }]}>{formatSize(attachment.size)}</Text>
							<Ionicons name="open-outline" size={layout.mark} color={palette.fgFaint} />
						</Pressable>
					);
				})}
			</View>
			{viewing !== undefined && (
				<ImageViewer
					url={attachmentUrl(serverUrl, viewing)}
					filename={viewing.filename}
					onClose={() => setViewing(undefined)}
				/>
			)}
		</View>
	);
}
