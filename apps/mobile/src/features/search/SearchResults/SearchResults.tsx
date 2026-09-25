import { FlashList } from "@shopify/flash-list";
import type { PageSummary, TicketSummary } from "@trellis/api";
import { TicketRow } from "../../../components/TicketRow";
import { PageRow } from "./components/PageRow";
import { searchRows } from "./searchRows";

export type SearchResultsProps = {
	tickets: readonly TicketSummary[];
	pages: readonly PageSummary[];
	onSelect: (identifier: string) => void;
};

export function SearchResults({ tickets, pages, onSelect }: SearchResultsProps) {
	return (
		<FlashList
			testID="search-results"
			data={searchRows(tickets, pages)}
			keyExtractor={(item) => (item.kind === "ticket" ? `ticket:${item.ticket.id}` : `page:${item.page.id}`)}
			renderItem={({ item }) =>
				item.kind === "ticket" ? (
					<TicketRow testID={`ticket-row-${item.ticket.identifier}`} ticket={item.ticket} onPress={onSelect} />
				) : (
					<PageRow page={item.page} />
				)
			}
		/>
	);
}
