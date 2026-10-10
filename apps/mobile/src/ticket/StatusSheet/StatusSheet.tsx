import type { Status } from "@trellis/api";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { RadioRow } from "../../components/RadioRow";
import { Sheet } from "../../components/Sheet";
import { StatusIcon } from "../../components/StatusIcon";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { groupLabels, groupStatuses } from "../statusGroups";
import { StatusCreateForm } from "./components/StatusCreateForm";

export type StatusSheetProps = {
	open: boolean;
	project: string;
	statuses: readonly Status[];
	statusesReady: boolean;
	statusError?: string;
	currentId: string;
	onChoose: (status: Status) => void;
	onClose: () => void;
};

const styles = StyleSheet.create({
	field: { paddingHorizontal: tokens.space[4], paddingBottom: tokens.space[2] },
	message: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, paddingTop: tokens.space[2] },
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

export function StatusSheet(props: StatusSheetProps) {
	return props.open ? <StatusChoices key={props.project} {...props} /> : null;
}

function StatusChoices({
	project,
	statuses,
	statusesReady,
	statusError,
	currentId,
	onChoose,
	onClose,
}: StatusSheetProps) {
	const palette = usePalette();
	const { height } = useWindowDimensions();
	const [search, setSearch] = useState("");
	const [createName, setCreateName] = useState<string>();
	const name = search.trim();
	const query = name.toLowerCase();
	const matches = statuses.filter((status) => status.name.toLowerCase().includes(query));
	const canCreate = statusesReady && name.length > 0 && !statuses.some((status) => status.name.toLowerCase() === query);
	if (createName !== undefined) {
		return (
			<StatusCreateForm
				project={project}
				name={createName}
				onChoose={onChoose}
				onClose={onClose}
				onCancel={() => setCreateName(undefined)}
			/>
		);
	}
	return (
		<Sheet title="Status" testID="status-sheet" onClose={onClose}>
			<View style={styles.field}>
				<Field label="Search statuses" value={search} onChangeText={setSearch} autoCorrect={false} />
				{!statusesReady && (
					<Text
						accessibilityRole={statusError === undefined ? undefined : "alert"}
						accessibilityLiveRegion="polite"
						style={[styles.message, { color: statusError === undefined ? palette.fgMuted : palette.danger }]}
					>
						{statusError ?? "Load statuses…"}
					</Text>
				)}
			</View>
			<ScrollView style={{ maxHeight: height / 2 }} keyboardShouldPersistTaps="handled">
				{groupStatuses(matches).map((group) => (
					<View key={group.category}>
						<Text accessibilityRole="header" style={[styles.heading, { color: palette.fgFaint }]}>
							{groupLabels[group.category]}
						</Text>
						{group.statuses.map((status) => (
							<RadioRow
								key={status.id}
								label={status.name}
								checked={status.id === currentId}
								icon={<StatusIcon category={status.category} />}
								onPress={() => onChoose(status)}
							/>
						))}
					</View>
				))}
				{canCreate && (
					<View style={styles.field}>
						<Button label={`Create status "${name}"`} onPress={() => setCreateName(name)} />
					</View>
				)}
			</ScrollView>
		</Sheet>
	);
}
