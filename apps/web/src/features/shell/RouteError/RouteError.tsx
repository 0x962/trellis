import { useRouter } from "@tanstack/react-router";
import { Button, EmptyState } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { useLiveStatus } from "../../../lib/liveStatus";
import { failureKind } from "./failureKind";

export type RouteErrorProps = {
	error: unknown;
};

// What a page shows when its load failed, with the cause the code holds.
// A server that does not answer shows "Server offline", and the page loads
// again on its own when the live connection comes back. A server that
// refused the request shows that it refused, so a person never reads a
// refusal as an empty Trellis. A route file that no longer exists on the
// server means a new build replaced the old one, so Retry reloads the whole
// page to fetch the new files.
export function RouteError({ error }: RouteErrorProps) {
	const router = useRouter();
	const { live } = useApp();
	const status = useLiveStatus(live);
	const previous = useRef(status);
	const failure = failureKind(error);
	// A route file that does not load while the connection is down means the
	// server is down, not a new build.
	const kind = failure === "chunk" && status !== "live" ? "offline" : failure;

	useEffect(() => {
		const before = previous.current;
		previous.current = status;
		if (kind === "offline" && status === "live" && before !== "live") void router.invalidate();
	}, [status, kind, router]);

	if (kind === "chunk") {
		return (
			<EmptyState
				variant="page"
				className="page-card"
				title="A new version of trellis is on the server"
				description="trellis did not load this page, because the server holds a new build. Reload to use it."
				action={
					<Button size="md" onClick={() => window.location.reload()}>
						Reload
					</Button>
				}
			/>
		);
	}
	if (kind === "refused") {
		return (
			<EmptyState
				variant="page"
				className="page-card"
				title="Trellis could not sign in to its server"
				description={
					<>
						The server at <span className="text-fg">{window.location.host}</span> refused this browser. trellis reads no
						project and no name until the server accepts it.
					</>
				}
				action={
					<Button size="md" onClick={() => void router.invalidate()}>
						Retry
					</Button>
				}
			/>
		);
	}
	if (kind === "offline") {
		return (
			<EmptyState
				variant="page"
				className="page-card"
				title="Server offline"
				description={
					<>
						trellis did not load this page. The server at <span className="text-fg">{window.location.host}</span> does
						not answer.
					</>
				}
				action={
					<Button size="md" onClick={() => (failure === "chunk" ? window.location.reload() : void router.invalidate())}>
						Retry
					</Button>
				}
			/>
		);
	}
	return (
		<EmptyState
			variant="page"
			className="page-card"
			title="trellis did not load this page"
			description={error instanceof Error ? error.message : String(error)}
			action={
				<Button size="md" onClick={() => void router.invalidate()}>
					Retry
				</Button>
			}
		/>
	);
}
