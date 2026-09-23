import type { Ticket } from "@trellis/api";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { PriorityIcon } from "../../components/PriorityIcon";
import { StatusIcon } from "../../components/StatusIcon";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { priorityLabels } from "../PrioritySheet/priorities";
import { PropertyCell } from "./components/PropertyCell";

export type PropertyGridProps = {
	ticket: Ticket;
	// The title of the parent ticket, once its detail is loaded.
	parentTitle: string | undefined;
	onStatusPress: () => void;
	onPriorityPress: () => void;
};

const styles = StyleSheet.create({
	grid: { gap: tokens.space[2], paddingHorizontal: tokens.space[4], paddingTop: tokens.space[4] },
	row: { flexDirection: "row", gap: tokens.space[2] },
	value: { flex: 1, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	mono: { fontFamily: tokens.font.mono, fontSize: tokens.text.sm, lineHeight: tokens.leading.md },
});

// The four rows under the title. The Status row and the Priority row are
// 44 px buttons named by their label. The Project row shows the key, and
// the Parent row shows the identifier with the title and opens the parent.
export function PropertyGrid({ ticket, parentTitle, onStatusPress, onPriorityPress }: PropertyGridProps) {
	const palette = usePalette();
	const { status, parent, project } = ticket;
	return (
		<View style={styles.grid}>
			<View style={styles.row}>
				<PropertyCell label="Status" onPress={onStatusPress}>
					<StatusIcon
						category={status.category}
						progress={ticket.childCount === 0 ? undefined : ticket.childDoneCount / ticket.childCount}
						label={`Status: ${status.name}`}
					/>
					<Text numberOfLines={1} style={[styles.value, { color: palette.fg }]}>
						{status.name}
					</Text>
				</PropertyCell>
				<PropertyCell label="Priority" onPress={onPriorityPress}>
					<PriorityIcon priority={ticket.priority} />
					<Text numberOfLines={1} style={[styles.value, { color: palette.fg }]}>
						{priorityLabels[ticket.priority]}
					</Text>
				</PropertyCell>
			</View>
			<View style={styles.row}>
				<PropertyCell label="Project">
					<Text numberOfLines={1} style={[styles.value, { color: palette.fg }]}>
						{project.key}
					</Text>
				</PropertyCell>
				<PropertyCell
					label="Parent"
					link={parent === null ? undefined : () => router.push(`/ticket/${parent.identifier}`)}
				>
					{parent === null ? (
						<Text style={[styles.value, { color: palette.fgFaint }]}>None</Text>
					) : (
						<>
							<Text style={[styles.mono, { color: palette.fgMuted }]}>{parent.identifier}</Text>
							<Text numberOfLines={1} style={[styles.value, { color: palette.fg }]}>
								{parentTitle ?? ""}
							</Text>
						</>
					)}
				</PropertyCell>
			</View>
		</View>
	);
}
