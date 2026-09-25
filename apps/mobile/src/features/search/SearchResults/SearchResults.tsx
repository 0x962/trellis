import { FlashList } from "@shopify/flash-list";
import type { PageSummary, TicketSummary } from "@trellis/api";
import { StyleSheet, Text } from "react-native";
import { Row } from "../../../components/Row";
import { TicketRow } from "../../../components/TicketRow";
import { tokens } from "../../../theme/tokens";
import { usePalette } from "../../../theme/usePalette";
import { searchRows } from "./searchRows";

export type SearchResultsProps = {
	tickets: readonly TicketSummary[];
	pages?: readonly PageSummary[];
	onSelect: (identifier: string) => void;
	onSelectPage?: (ref: string) => void;
};

const styles = StyleSheet.create({
	summary: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
});

const PageSearchRow = ({ page, onSelect }: { page: PageSummary; onSelect?: (ref: string) => void }) => {
	const palette = usePalette();
	return (
		<Row
			testID={`page-row-${page.ref}`}
			id={page.projectKey}
			title={page.title}
			meta={
				<Text numberOfLines={1} style={[styles.summary, { color: palette.fgMuted }]}>
					{page.summary || `Version ${page.latestVersion}`}
				</Text>
			}
			onPress={onSelect === undefined ? undefined : () => onSelect(page.ref)}
		/>
	);
};

export function SearchResults({ tickets, pages = [], onSelect, onSelectPage }: SearchResultsProps) {
	return (
		<FlashList
			testID="search-results"
			data={searchRows(tickets, pages)}
			keyExtractor={(item) => (item.kind === "ticket" ? `ticket:${item.ticket.id}` : `page:${item.page.id}`)}
			renderItem={({ item }) =>
				item.kind === "ticket" ? (
					<TicketRow testID={`ticket-row-${item.ticket.identifier}`} ticket={item.ticket} onPress={onSelect} />
				) : (
					<PageSearchRow page={item.page} onSelect={onSelectPage} />
				)
			}
		/>
	);
}
