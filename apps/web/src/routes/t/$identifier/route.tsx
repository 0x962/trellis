import { ORPCError } from "@orpc/client";
import { createFileRoute, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { TicketRefStringSchema, UlidSchema } from "@trellis/api";
import { EmptyState } from "@trellis/ui";
import { z } from "zod";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { TicketView } from "../../../features/ticket/TicketView";
import type { AppContext } from "../../../lib/appContext";
import { lastListHref } from "../../../lib/lastList";

const ticketOptions = (context: AppContext, identifier: string) =>
	context.orpc.tickets.get.queryOptions({ input: { ticket: TicketRefStringSchema.parse(identifier) } });

export const Route = createFileRoute("/t/$identifier")({
	validateSearch: z.object({ thread: UlidSchema.optional().catch(undefined) }),
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
	const { thread } = Route.useSearch();
	const router = useRouter();
	return (
		<TicketView
			key={identifier}
			identifier={TicketRefStringSchema.parse(identifier)}
			thread={thread}
			onReturnToList={() => void router.navigate({ href: lastListHref() })}
		/>
	);
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
