import type { ProjectSummary } from "@trellis/api";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout } from "../../../../../theme/layout";
import { tokens } from "../../../../../theme/tokens";
import { usePalette } from "../../../../../theme/usePalette";

export type ProjectRowProps = {
	project: ProjectSummary;
	// Takes the canonical project path of the pressed row, such as CDE.web.
	onPress: (path: string) => void;
};

// One indent level. A sub-project sits one step right of its parent, and a
// root sits at the left edge of the list.
const indentStep = tokens.space[4];

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

// One project of the tree: the key badge on a root, the name, and how many
// tickets are open under it. The row is one step right per level, so the
// left edge of the name draws the shape of the tree.
export function ProjectRow({ project, onPress }: ProjectRowProps) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="button"
			testID={`project-row-${project.path}`}
			onPress={() => onPress(project.path)}
			style={({ pressed }) => [
				styles.row,
				{ paddingLeft: project.depth * indentStep, backgroundColor: pressed ? palette.surface : palette.bg },
			]}
		>
			<View style={[styles.body, { borderBottomColor: palette.border }]}>
				{project.depth === 0 && (
					<Text style={[styles.badge, { color: palette.fgMuted, backgroundColor: palette.elevated }]}>
						{project.key}
					</Text>
				)}
				<Text numberOfLines={1} style={[styles.name, { color: palette.fg }]}>
					{project.name}
				</Text>
				<Text style={[styles.count, { color: palette.fgFaint }]}>{project.openCount}</Text>
			</View>
		</Pressable>
	);
}
