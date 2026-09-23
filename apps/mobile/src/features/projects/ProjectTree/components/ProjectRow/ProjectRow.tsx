import type { ProjectSummary } from "@trellis/api";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout } from "../../../../../theme/layout";
import { tokens } from "../../../../../theme/tokens";
import { usePalette } from "../../../../../theme/usePalette";

export type ProjectRowProps = {
	project: ProjectSummary;
	// Takes the key of the pressed row, such as CDE.
	onPress: (key: string) => void;
};

const styles = StyleSheet.create({
	row: { height: layout.treeRow },
	body: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[2],
		paddingHorizontal: tokens.space[4],
		borderBottomWidth: layout.stroke,
	},
	badge: {
		fontSize: tokens.text.xs,
		lineHeight: tokens.leading.xs,
		paddingHorizontal: tokens.space[1],
		borderRadius: tokens.radius.sm,
		overflow: "hidden",
	},
	name: { flex: 1, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	count: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontVariant: ["tabular-nums"] },
});

// One project: the key badge, the name, and how many of its tickets are
// open.
export function ProjectRow({ project, onPress }: ProjectRowProps) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="button"
			testID={`project-row-${project.key}`}
			onPress={() => onPress(project.key)}
			style={({ pressed }) => [styles.row, { backgroundColor: pressed ? palette.surface : palette.bg }]}
		>
			<View style={[styles.body, { borderBottomColor: palette.border }]}>
				<Text style={[styles.badge, { color: palette.fgMuted, backgroundColor: palette.elevated }]}>{project.key}</Text>
				<Text numberOfLines={1} style={[styles.name, { color: palette.fg }]}>
					{project.name}
				</Text>
				<Text style={[styles.count, { color: palette.fgFaint }]}>{project.openCount}</Text>
			</View>
		</Pressable>
	);
}
