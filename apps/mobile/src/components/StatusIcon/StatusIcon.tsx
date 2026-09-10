import { StyleSheet, Text, View } from "react-native";
import { layout } from "../../theme/layout";
import { type Palette, tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type StatusCategory = "todo" | "started" | "review" | "done" | "canceled";

export type StatusIconProps = {
	category: StatusCategory;
	// For the review category: who reviews. An agent reviewer carries the glyph.
	reviewer?: "human" | "agent";
	// For the started category: the share of sub-tickets that are done, 0 to 1.
	// Without it the disc is half full.
	progress?: number;
	// The status name. A labeled icon is an image with a name; an unlabeled one
	// is decoration beside the name it stands for.
	label?: string;
};

const colors: Record<StatusCategory, keyof Palette> = {
	todo: "fgFaint",
	started: "warning",
	review: "accent",
	done: "success",
	canceled: "fgFaint",
};

const size = layout.statusIcon;
const inner = size / 2;

const styles = StyleSheet.create({
	box: { width: size, height: size, alignItems: "center", justifyContent: "center" },
	ring: { borderRadius: size / 2, borderWidth: layout.ring },
	disc: { width: inner, height: inner, borderRadius: inner / 2, overflow: "hidden", flexDirection: "row" },
	glyph: { fontSize: tokens.micro.kbd, lineHeight: size, fontWeight: "700", textAlign: "center" },
	diamond: { width: inner / 2, height: inner / 2, transform: [{ rotate: "45deg" }] },
});

// The status mark by category, drawn with Views. A started disc fills from
// the left as `progress` rises. A review ring is dotted; the agent variant
// carries a diamond. Done is a filled disc with a check; canceled is a ring
// with a cross.
export function StatusIcon({ category, reviewer = "human", progress, label }: StatusIconProps) {
	const palette = usePalette();
	const color = category === "review" && reviewer === "agent" ? palette.agent : palette[colors[category]];
	const filled = category === "done";
	return (
		<View
			accessible={label !== undefined}
			accessibilityRole={label ? "image" : undefined}
			accessibilityLabel={label}
			accessibilityElementsHidden={!label}
			importantForAccessibility={label ? "auto" : "no-hide-descendants"}
			style={styles.box}
		>
			<View
				style={[
					StyleSheet.absoluteFill,
					styles.ring,
					{ borderColor: color, backgroundColor: filled ? color : undefined },
					category === "review" && { borderStyle: "dotted" },
				]}
			/>
			{category === "started" && (
				<View style={styles.disc}>
					<View style={{ width: `${(progress ?? 0.5) * 100}%`, backgroundColor: color }} />
				</View>
			)}
			{category === "review" && reviewer === "agent" && <View style={[styles.diamond, { backgroundColor: color }]} />}
			{category === "done" && <Text style={[styles.glyph, { color: palette.surface }]}>✓</Text>}
			{category === "canceled" && <Text style={[styles.glyph, { color }]}>×</Text>}
		</View>
	);
}
