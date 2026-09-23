import { useRouter } from "@tanstack/react-router";
import { Button, FailureState } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../../lib/appContext";
import { useLiveStatus } from "../../../lib/liveStatus";
import { failureKind } from "./failureKind";
import { failureRecovered, shownFailure } from "./routeFailure";

export type RouteErrorProps = {
	error: unknown;
};

// What a page shows when its load failed, with the cause the code holds.
// A server that does not answer says that it is offline, and the page
// loads again on its own when the live connection comes back. A server
// that refused the request says so, so a person never reads a refusal as
// an empty Trellis. A route file that no longer exists on the server means
// a new build replaced the old one, so Reload fetches the new files.
export function RouteError({ error }: RouteErrorProps) {
	const router = useRouter();
	const { live } = useApp();
	const status = useLiveStatus(live);
	const previous = useRef(status);
	const failure = failureKind(error);
	const kind = shownFailure(failure, status);
	const message = error instanceof Error ? error.message : String(error);

	useEffect(() => {
		const before = previous.current;
		previous.current = status;
		if (failureRecovered(kind, status, before)) void router.invalidate();
	}, [status, kind, router]);

	if (kind === "chunk")
		return (
			<FailureState
				variant="page"
				className="page-card"
				title="Trellis has a new version on the server"
				description="This page needs the files of the new version."
				action={
					<Button size="md" onClick={() => window.location.reload()}>
						Reload
					</Button>
				}
			/>
		);
	if (kind === "refused")
		return (
			<FailureState
				variant="page"
				className="page-card"
				title="The server refused this browser"
				description={
					<>
						The server at <span className="text-fg">{window.location.host}</span> takes no request from this browser.
						Trellis reads no project and no name until the server accepts it.
					</>
				}
				detail={message}
				action={
					<Button size="md" onClick={() => void router.invalidate()}>
						Retry
					</Button>
				}
			/>
		);
	if (kind === "offline")
		return (
			<FailureState
				variant="page"
				className="page-card"
				title="The server does not answer"
				description={
					<>
						The server at <span className="text-fg">{window.location.host}</span> is offline.
					</>
				}
				recovery="waiting"
				detail={message}
				action={
					<Button size="md" onClick={() => (failure === "chunk" ? window.location.reload() : void router.invalidate())}>
						Retry
					</Button>
				}
			/>
		);
	return (
		<FailureState
			variant="page"
			className="page-card"
			title="This page did not load"
			detail={message}
			action={
				<Button size="md" onClick={() => void router.invalidate()}>
					Retry
				</Button>
			}
		/>
	);
}
