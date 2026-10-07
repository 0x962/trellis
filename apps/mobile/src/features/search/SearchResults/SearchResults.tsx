import { FlashList } from "@shopify/flash-list";
import { ProjectRow } from "../../../components/ProjectRow";
import { TicketRow } from "../../../components/TicketRow";
import type { SearchData } from "../searchView";
import { PageRow } from "./components/PageRow";
import { ResultHeader } from "./components/ResultHeader";
import { ResultNote } from "./components/ResultNote";
import { type SearchRow, searchRowKey, searchRows } from "./searchRows";

export type SearchResultsProps = {
	data: SearchData;
	// Takes the identifier of the pressed ticket, such as CDE-42.
	onSelectTicket: (identifier: string) => void;
	// Takes the key of the pressed project, such as CDE.
	onSelectProject: (key: string) => void;
};

// The results in groups: tickets, projects, then Pages. The keyboard stays
// up while the list scrolls under a finger, and the first tap on a result
// opens it instead of only closing the keyboard.
export function SearchResults({ data, onSelectTicket, onSelectProject }: SearchResultsProps) {
	const renderRow = (row: SearchRow) => {
		if (row.kind === "header") return <ResultHeader label={row.label} count={row.count} note={row.note} />;
		if (row.kind === "ticket") {
			return <TicketRow testID={`ticket-row-${row.ticket.identifier}`} ticket={row.ticket} onPress={onSelectTicket} />;
		}
		if (row.kind === "project") return <ProjectRow project={row.project} onPress={onSelectProject} />;
		if (row.kind === "page") return <PageRow page={row.page} />;
		return <ResultNote text={row.text} />;
	};
	return (
		<FlashList
			testID="search-results"
			data={searchRows(data)}
			keyExtractor={searchRowKey}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode="on-drag"
			renderItem={({ item }) => renderRow(item)}
		/>
	);
}
