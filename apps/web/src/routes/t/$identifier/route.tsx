import { createFileRoute, redirect } from "@tanstack/react-router";
import { TicketRefStringSchema } from "@trellis/api";
import { pageSheetActions } from "../../../stores/pageSheetStore";

// Shared URLs open a ticket sheet over the home page. A preload must leave
// the current sheet unchanged until the person follows the link.
export const Route = createFileRoute("/t/$identifier")({
	beforeLoad: ({ params, preload }) => {
		if (preload) return;
		pageSheetActions.openTicket(TicketRefStringSchema.parse(params.identifier));
		throw redirect({ to: "/", replace: true });
	},
});
