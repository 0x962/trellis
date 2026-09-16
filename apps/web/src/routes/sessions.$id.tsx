import { ORPCError } from "@orpc/client";
import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { UlidSchema } from "@trellis/api";
import { EmptyState } from "@trellis/ui";
import { SessionPage } from "../features/sessions/SessionPage";
import { NotFoundState } from "../features/shell/NotFoundState";
import type { AppContext } from "../lib/appContext";

const sessionOptions = (context: AppContext, id: string) => context.orpc.sessions.get.queryOptions({ input: { id } });

// `/sessions/<id>`: one session with the terminal of its agent.
export const Route = createFileRoute("/sessions/$id")({
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(sessionOptions(context, UlidSchema.parse(params.id)));
	},
	component: SessionRoute,
	errorComponent: SessionError,
});

function SessionRoute() {
	const { id } = Route.useParams();
	return <SessionPage id={id} />;
}

function SessionError({ error }: ErrorComponentProps) {
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return <NotFoundState ref={ref} />;
	}
	return (
		<EmptyState
			variant="page"
			className="page-card"
			title="The session did not load."
			description={error instanceof Error ? error.message : String(error)}
		/>
	);
}
