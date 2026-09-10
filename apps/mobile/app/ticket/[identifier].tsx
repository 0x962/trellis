import { useLocalSearchParams } from "expo-router";
import { EmptyState } from "../../src/components/EmptyState";

export default function TicketScreen() {
	const { identifier } = useLocalSearchParams<{ identifier: string }>();
	return <EmptyState title={identifier} hint="The ticket screen is not built yet." />;
}
