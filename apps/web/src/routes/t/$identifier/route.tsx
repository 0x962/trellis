import { ORPCError } from "@orpc/client";
import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { TicketRefStringSchema } from "@trellis/api";
import { EmptyState } from "@trellis/ui";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { TicketView } from "../../../features/ticket/TicketView";
import type { AppContext } from "../../../lib/appContext";

const ticketOptions = (context: AppContext, identifier: string) =>
	context.orpc.tickets.get.queryOptions({ input: { ticket: TicketRefStringSchema.parse(identifier) } });

export const Route = createFileRoute("/t/$identifier")({
	loader: ({ context, params }) => context.queryClient.ensureQueryData(ticketOptions(context, params.identifier)),
	component: TicketPage,
	errorComponent: TicketError,
});

function TicketPage() {
	const { identifier } = Route.useParams();
	return <TicketView identifier={TicketRefStringSchema.parse(identifier)} variant="page" />;
}

function TicketError({ error }: ErrorComponentProps) {
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return <NotFoundState ref={ref} searchFor={ref} />;
	}
	return (
		<EmptyState
			title="Something went wrong"
			description={error instanceof Error ? error.message : String(error)}
			className="flex-1 justify-center"
		/>
	);
}
