import { StyleSheet, Text, View } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type ActorKind = "human" | "agent" | "system";

export type ActorChipProps = {
	name: string;
	kind: ActorKind;
	// A live actor has an active session; the mark shows the dot.
	live?: boolean;
};

// "Navid Khan" gives NK; "navid" gives N.
const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word.charAt(0).toUpperCase())
		.join("");

const styles = StyleSheet.create({
	chip: { flexDirection: "row", alignItems: "center", gap: tokens.space.half * 3 },
	mark: { width: layout.avatar, height: layout.avatar, alignItems: "center", justifyContent: "center" },
	human: { borderRadius: layout.avatar / 2 },
	agent: { borderRadius: tokens.radius.sm, borderWidth: layout.stroke },
	initials: { fontSize: tokens.micro.initials, lineHeight: layout.avatar, fontWeight: "600" },
	glyph: { fontSize: tokens.micro.kbd, lineHeight: layout.avatar },
	dot: {
		position: "absolute",
		top: -tokens.space.half,
		right: -tokens.space.half,
		width: layout.liveDot,
		height: layout.liveDot,
		borderRadius: layout.liveDot / 2,
		borderWidth: layout.stroke,
	},
	agentName: { fontFamily: tokens.font.mono, fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
	humanName: { fontWeight: "500", fontSize: tokens.text.base, lineHeight: tokens.leading.base },
	suffix: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
});

// A human has a circle with initials. An agent or the system has a square,
// a mono name, and a suffix that identifies the stored kind.
export function ActorChip({ name, kind, live = false }: ActorChipProps) {
	const palette = usePalette();
	const human = kind === "human";
	const suffix = kind === "agent" ? "· agent" : "· system";
	return (
		<View style={styles.chip}>
			<View
				accessibilityRole="image"
				accessibilityLabel={human ? name : `${name} ${suffix}`}
				style={[
					styles.mark,
					human
						? [styles.human, { backgroundColor: palette.fgMuted }]
						: [styles.agent, { borderColor: palette.agent, backgroundColor: palette.agentSoft }],
				]}
			>
				{human ? (
					<Text style={[styles.initials, { color: palette.surface }]}>{initials(name)}</Text>
				) : (
					<Text style={[styles.glyph, { color: palette.agent }]}>⟡</Text>
				)}
				{live && (
					<View
						testID="live-dot"
						style={[styles.dot, { backgroundColor: palette.success, borderColor: palette.surface }]}
					/>
				)}
			</View>
			<Text style={human ? [styles.humanName, { color: palette.fg }] : [styles.agentName, { color: palette.agent }]}>
				{name}
			</Text>
			{!human && <Text style={[styles.suffix, { color: palette.fgFaint }]}>{suffix}</Text>}
		</View>
	);
}
