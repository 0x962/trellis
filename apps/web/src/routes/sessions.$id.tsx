import { ORPCError } from "@orpc/client";
import { createFileRoute, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { UlidSchema } from "@trellis/api";
import { Button, FailureState } from "@trellis/ui";
import { SessionPage } from "../features/sessions/SessionPage";
import { NotFoundState } from "../features/shell/NotFoundState";
import { failureKind, isConnectionFailure, RouteError } from "../features/shell/RouteError";
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
	const router = useRouter();
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return <NotFoundState ref={ref} />;
	}
	if (isConnectionFailure(failureKind(error))) return <RouteError error={error} />;
	return (
		<FailureState
			variant="page"
			className="page-card"
			title="This session did not load"
			detail={error instanceof Error ? error.message : String(error)}
			action={
				<Button size="md" onClick={() => void router.invalidate()}>
					Retry
				</Button>
			}
		/>
	);
}
