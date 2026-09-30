import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { TicketView } from "../../../../ticket/TicketView";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { BrowserSheet } from "../BrowserSheet";
import { ProjectSettingsSheet } from "../ProjectSettingsSheet";
import { PullRequestSheet } from "../PullRequestSheet";
import { SessionSheet } from "../SessionSheet";
import { SettingsSheet } from "../SettingsSheet";

// One ticket opens in a sheet over the page that holds its link.
// The review sheet and the session sheet render inside this sheet: Base
// UI treats a dialog inside another dialog as the top of the stack, so
// Escape and a click beside the sheets close the top one and leave the
// ticket open.
//
// The sheet stays mounted while it is closed. A sheet that mounts open skips
// its slide, so the first ticket would appear with no motion.
export function TicketSheet() {
	const ticket = usePageSheetStore((state) => state.ticket);
	const shown = useShown(ticket);
	return (
		<PageSheet
			open={ticket !== null}
			onClose={pageSheetActions.closeTicket}
			onReturn={pageSheetActions.returnToTicket}
			title={shown ?? "Ticket"}
		>
			{shown !== null && (
				<>
					<TicketView key={shown} identifier={shown} />
					<PullRequestSheet ticket={shown} />
					<SessionSheet />
					<SettingsSheet at="ticket" />
					<ProjectSettingsSheet at="ticket" />
					<BrowserSheet at="ticket" />
				</>
			)}
		</PageSheet>
	);
}
