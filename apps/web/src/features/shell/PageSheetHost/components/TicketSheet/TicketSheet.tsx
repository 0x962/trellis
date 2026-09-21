import { Link } from "@tanstack/react-router";
import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { TicketView } from "../../../../ticket/TicketView";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { PullRequestSheet } from "../PullRequestSheet";
import { SessionSheet } from "../SessionSheet";

// One ticket, as the whole ticket page in a sheet over the list that opened
// it. The review sheet and the session sheet render inside this sheet: Base
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
			title={shown ?? "Ticket"}
			fullPage={shown === null ? undefined : <Link to="/t/$identifier" params={{ identifier: shown }} />}
		>
			{shown !== null && (
				<>
					<TicketView key={shown} identifier={shown} />
					<PullRequestSheet ticket={shown} />
					<SessionSheet />
				</>
			)}
		</PageSheet>
	);
}
