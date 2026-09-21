import { usePageSheetStore } from "../../../stores/pageSheetStore";
import { EpicStatisticsSheet } from "./components/EpicStatisticsSheet";
import { PullRequestSheet } from "./components/PullRequestSheet";
import { TicketSheet } from "./components/TicketSheet";

// The root shell mounts this sheet stack once. It opens one statistics
// sheet, or a ticket with a pull request over it.
//
// A pull request that opens from a ticket renders inside `TicketSheet`,
// because Base UI reads the stack from the React tree. A pull request that
// opens from a list has no ticket under it and renders here.
export function PageSheetHost() {
	const ticket = usePageSheetStore((state) => state.ticket);
	return (
		<>
			<TicketSheet />
			{ticket === null && <PullRequestSheet />}
			{ticket === null && <EpicStatisticsSheet />}
		</>
	);
}
