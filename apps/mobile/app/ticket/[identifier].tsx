import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { EmptyState } from "../../src/components/EmptyState";
import { getClient } from "../../src/lib/orpc";
import { usePalette } from "../../src/theme/usePalette";
import { TicketView } from "../../src/ticket/TicketView";
import { ticketDetailQuery } from "../../src/ticket/ticketQueries";

const styles = StyleSheet.create({
	loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});

const isNotFound = (error: unknown) => error instanceof ORPCError && error.code === "NOT_FOUND";

export default function TicketScreen() {
	const { identifier } = useLocalSearchParams<{ identifier: string }>();
	const palette = usePalette();
	const detail = useQuery(ticketDetailQuery(getClient(), identifier));
	if (detail.data !== undefined) return <TicketView ticket={detail.data} />;
	if (detail.error !== null) {
		if (isNotFound(detail.error)) {
			return (
				<EmptyState title={`${identifier} does not exist`} hint="The server holds no ticket with this identifier." />
			);
		}
		return <EmptyState title="Cannot reach the server" hint={detail.error.message} />;
	}
	return (
		<View style={styles.loading}>
			<ActivityIndicator color={palette.fgMuted} />
		</View>
	);
}
