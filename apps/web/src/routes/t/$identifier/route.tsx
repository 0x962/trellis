import { ORPCError } from "@orpc/client";
import { createFileRoute, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { TicketRefStringSchema } from "@trellis/api";
import { Button, FailureState } from "@trellis/ui";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { failureKind, isConnectionFailure, RouteError } from "../../../features/shell/RouteError";
import { TicketView } from "../../../features/ticket/TicketView";
import type { AppContext } from "../../../lib/appContext";

const ticketOptions = (context: AppContext, identifier: string) =>
	context.orpc.tickets.get.queryOptions({ input: { ticket: TicketRefStringSchema.parse(identifier) } });

export const Route = createFileRoute("/t/$identifier")({
	loader: async ({ context, params }) => {
		const ticket = await context.queryClient.ensureQueryData(ticketOptions(context, params.identifier));
		await context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({ input: { project: ticket.project.key } }),
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
	const router = useRouter();
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return <NotFoundState ref={ref} searchFor={ref} />;
	}
	if (isConnectionFailure(failureKind(error))) return <RouteError error={error} />;
	return (
		<FailureState
			variant="page"
			className="page-card"
			title="This ticket did not load"
			detail={error instanceof Error ? error.message : String(error)}
			action={
				<Button size="md" onClick={() => void router.invalidate()}>
					Retry
				</Button>
			}
		/>
	);
}
