import type { Status } from "@trellis/api";
import { StyleSheet, Text, View } from "react-native";
import { RadioRow } from "../../components/RadioRow";
import { Sheet } from "../../components/Sheet";
import { StatusIcon } from "../../components/StatusIcon";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { groupLabels, groupStatuses } from "../statusGroups";

export type StatusSheetProps = {
	open: boolean;
	statuses: readonly Status[];
	currentId: string;
	onChoose: (status: Status) => void;
	onClose: () => void;
};

const styles = StyleSheet.create({
	heading: {
		fontSize: tokens.text.xs,
		lineHeight: tokens.leading.xs,
		fontWeight: "500",
		textTransform: "uppercase",
		paddingHorizontal: tokens.space[4],
		paddingTop: tokens.space[3],
		paddingBottom: tokens.space[1],
	},
});

// The bottom sheet under `testID="status-sheet"`: one header per category
// in the fixed order, one radio per status named by the status name.
export function StatusSheet({ open, statuses, currentId, onChoose, onClose }: StatusSheetProps) {
	const palette = usePalette();
	if (!open) return null;
	return (
		<Sheet title="Status" testID="status-sheet" onClose={onClose}>
			{groupStatuses(statuses).map((group) => (
				<View key={group.category}>
					<Text accessibilityRole="header" style={[styles.heading, { color: palette.fgFaint }]}>
						{groupLabels[group.category]}
					</Text>
					{group.statuses.map((status) => (
						<RadioRow
							key={status.id}
							label={status.name}
							checked={status.id === currentId}
							icon={<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />}
							onPress={() => onChoose(status)}
						/>
					))}
				</View>
			))}
		</Sheet>
	);
}
