import { usePageSheetStore } from "../../../stores/pageSheetStore";
import { PullRequestSheet } from "./components/PullRequestSheet";
import { TicketSheet } from "./components/TicketSheet";

// The sheet stack of the app. The root shell mounts it once, so a ticket
// and a pull request open over any page.
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
		</>
	);
}
