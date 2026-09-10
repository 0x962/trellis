import { FlashList } from "@shopify/flash-list";
import type { TicketSummary } from "@trellis/api";
import { TicketRow } from "../../../components/TicketRow";

export type SearchResultsProps = {
	tickets: readonly TicketSummary[];
	onSelect: (identifier: string) => void;
};

export function SearchResults({ tickets, onSelect }: SearchResultsProps) {
	return (
		<FlashList
			testID="search-results"
			data={tickets}
			keyExtractor={(ticket) => ticket.id}
			renderItem={({ item }) => <TicketRow testID={`ticket-row-${item.identifier}`} ticket={item} onPress={onSelect} />}
		/>
	);
}
