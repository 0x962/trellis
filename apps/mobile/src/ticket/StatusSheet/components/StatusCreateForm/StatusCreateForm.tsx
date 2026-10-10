import { useQueryClient } from "@tanstack/react-query";
import type { Status, StatusCategory, StatusListOutput } from "@trellis/api";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Button } from "../../../../components/Button";
import { RadioRow } from "../../../../components/RadioRow";
import { Sheet } from "../../../../components/Sheet";
import { StatusIcon } from "../../../../components/StatusIcon";
import { describeError, type ErrorDescription } from "../../../../lib/describeError";
import { getClient } from "../../../../lib/orpc";
import { keys, store } from "../../../../lib/store";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";
import { groupLabels, groupOrder } from "../../../statusGroups";
import { statusesKey } from "../../../ticketQueries";

type StatusCreateFormProps = {
	project: string;
	name: string;
	onChoose: (status: Status) => void;
	onClose: () => void;
	onCancel: () => void;
};

const styles = StyleSheet.create({
	body: { paddingHorizontal: tokens.space[4], gap: tokens.space[3] },
	text: { fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	actions: { flexDirection: "row", gap: tokens.space[2], paddingTop: tokens.space[2] },
	action: { flex: 1 },
});

export function StatusCreateForm({ project, name, onChoose, onClose, onCancel }: StatusCreateFormProps) {
	const palette = usePalette();
	const { height } = useWindowDimensions();
	const queryClient = useQueryClient();
	const [category, setCategory] = useState<StatusCategory>();
	const [pending, setPending] = useState(false);
	const [failure, setFailure] = useState<ErrorDescription>();
	const active = useRef(true);
	const inFlight = useRef(false);
	const choose = useRef(onChoose);
	choose.current = onChoose;
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);

	const close = () => {
		active.current = false;
		onClose();
	};
	const create = async () => {
		if (category === undefined || inFlight.current) return;
		inFlight.current = true;
		setPending(true);
		setFailure(undefined);
		try {
			const status = await getClient().statuses.create({ project, name, category });
			await queryClient.cancelQueries({ queryKey: statusesKey(project), exact: true });
			queryClient.setQueryData<StatusListOutput>(statusesKey(project), (previous) => ({
				statuses: [...(previous?.statuses ?? []).filter((item) => item.id !== status.id), status],
			}));
			await queryClient.invalidateQueries({ queryKey: statusesKey(project), exact: true });
			if (active.current) choose.current(status);
		} catch (error) {
			if (active.current) setFailure(describeError(error, store.getString(keys.serverUrl)!));
		} finally {
			inFlight.current = false;
			if (active.current) setPending(false);
		}
	};

	return (
		<Sheet title="Create status" testID="status-create-sheet" onClose={close}>
			<ScrollView style={{ maxHeight: height / 2 }} keyboardShouldPersistTaps="handled">
				<View style={styles.body}>
					<Text style={[styles.text, { color: palette.fg }]}>{name}</Text>
					<Text style={[styles.text, { color: palette.fgMuted }]}>Choose a category.</Text>
				</View>
				<View>
					{groupOrder.map((value) => (
						<RadioRow
							key={value}
							label={groupLabels[value]}
							checked={category === value}
							disabled={pending}
							icon={<StatusIcon category={value} />}
							onPress={() => setCategory(value)}
						/>
					))}
				</View>
				{failure !== undefined && (
					<View style={styles.body} accessibilityRole="alert" accessibilityLiveRegion="assertive">
						<Text style={[styles.text, { color: palette.danger }]}>{failure.title}</Text>
						<Text style={[styles.text, { color: palette.fgMuted }]}>{failure.detail}</Text>
					</View>
				)}
			</ScrollView>
			<View style={[styles.body, styles.actions]}>
				<View style={styles.action}>
					<Button label="Cancel" disabled={pending} onPress={onCancel} />
				</View>
				<View style={styles.action}>
					<Button
						label={pending ? "Create…" : "Create"}
						variant="primary"
						disabled={pending || category === undefined}
						onPress={() => void create()}
					/>
				</View>
			</View>
		</Sheet>
	);
}
