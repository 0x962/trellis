import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatCount } from "../../../../lib/format";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";

export type SectionHeaderProps = {
	name: string;
	count: number;
	// The mark before the name.
	icon?: ReactNode;
	// The muted text on the right: the swipe hint, the section's rule, or
	// Show and Hide for a collapsible section.
	hint?: string;
	open: boolean;
	onToggle: () => void;
};

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[2],
		height: layout.sectionHeader,
		paddingHorizontal: tokens.space[4],
		borderBottomWidth: layout.stroke,
	},
	icon: { width: layout.statusIcon, alignItems: "center" },
	name: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, fontWeight: "600" },
	count: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, fontVariant: ["tabular-nums"] },
	spacer: { flex: 1 },
	hint: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
});

// The header of one Needs you section. The whole row is the button that
// opens and closes the section.
export function SectionHeader({ name, count, icon, hint, open, onToggle }: SectionHeaderProps) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={name}
			accessibilityState={{ expanded: open }}
			onPress={onToggle}
			style={({ pressed }) => [
				styles.header,
				{ backgroundColor: pressed ? palette.elevated : palette.surface, borderBottomColor: palette.border },
			]}
		>
			{icon !== undefined && <View style={styles.icon}>{icon}</View>}
			<Text style={[styles.name, { color: palette.fgMuted }]}>{name}</Text>
			<Text style={[styles.count, { color: palette.fgFaint }]}>{formatCount(count)}</Text>
			<View style={styles.spacer} />
			{hint !== undefined && <Text style={[styles.hint, { color: palette.fgFaint }]}>{hint}</Text>}
		</Pressable>
	);
}
