import { Link } from "@tanstack/react-router";
import { PageSheet } from "../../../../shell/PageSheet";
import { TicketView } from "../../../../ticket/TicketView";

// The ticket of the selected session, as the whole ticket page in a sheet
// over the session.
export function SessionTicketSheet({
	identifier,
	open,
	onClose,
}: {
	identifier: string;
	open: boolean;
	onClose: () => void;
}) {
	return (
		<PageSheet
			open={open}
			onClose={onClose}
			title={identifier}
			fullPage={<Link to="/t/$identifier" params={{ identifier }} />}
		>
			<TicketView identifier={identifier} />
		</PageSheet>
	);
}
