import { ORPCError } from "@orpc/client";
import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { TicketRefStringSchema } from "@trellis/api";
import { EmptyState } from "@trellis/ui";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { TicketView } from "../../../features/ticket/TicketView";
import type { AppContext } from "../../../lib/appContext";
import { TicketSearchSchema } from "../../../lib/ticketSearch";

const ticketOptions = (context: AppContext, identifier: string) =>
	context.orpc.tickets.get.queryOptions({ input: { ticket: TicketRefStringSchema.parse(identifier) } });

export const Route = createFileRoute("/t/$identifier")({
	validateSearch: TicketSearchSchema,
	loader: async ({ context, params }) => {
		const ticket = await context.queryClient.ensureQueryData(ticketOptions(context, params.identifier));
		await context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({ input: { project: ticket.project.path } }),
		);
	},
	component: TicketPage,
	errorComponent: TicketError,
});

function TicketPage() {
	const { identifier } = Route.useParams();
	return <TicketView key={identifier} identifier={TicketRefStringSchema.parse(identifier)} />;
}

function TicketError({ error }: ErrorComponentProps) {
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return <NotFoundState ref={ref} searchFor={ref} />;
	}
	return (
		<EmptyState
			variant="page"
			className="page-card"
			title="The ticket did not load."
			description={error instanceof Error ? error.message : String(error)}
		/>
	);
}
