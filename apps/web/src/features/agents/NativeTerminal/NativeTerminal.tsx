import type { AgentRun } from "@trellis/api";
import { Badge, cx, EmptyState } from "@trellis/ui";
import type { TerminalConnectionState, TerminalSurfaceProps } from "@trellis/ui/terminal";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { nativeTerminalTransport } from "./nativeTerminalTransport";
import { useTerminalAccessibility } from "./useTerminalAccessibility";

const TerminalSurface = lazy(async () => ({ default: (await import("@trellis/ui/terminal")).TerminalSurface }));

export function NativeTerminal({
	run,
	layout = "panel",
	readOnly = false,
	onLeave,
}: {
	run: AgentRun;
	layout?: TerminalSurfaceProps["layout"];
	readOnly?: boolean;
	onLeave?: () => void;
}) {
	const screenReaderMode = useTerminalAccessibility();
	const heading = useRef<HTMLHeadingElement>(null);
	const [connection, setConnection] = useState<TerminalConnectionState>({
		connection: "connecting",
		controllable: false,
		stopped: false,
		unavailableReason: null,
	});
	const identity = JSON.stringify([run.id, run.terminalId, run.sessionId]);
	const createTransport = useCallback(
		() => nativeTerminalTransport({ id: run.id, terminalId: run.terminalId, sessionId: run.sessionId }),
		[run.id, run.terminalId, run.sessionId],
	);
	const leave = useCallback(() => {
		if (onLeave) onLeave();
		else heading.current?.focus();
	}, [onLeave]);
	if (run.terminalId === null || run.runtime !== "native")
		return <EmptyState title="No local terminal" description="This assignment has no local process." />;
	return (
		<section
			aria-label={`Terminal for ${run.name}`}
			data-layout={layout}
			className={cx("flex min-w-0 flex-col", layout === "fill" ? "min-h-0 flex-1 overflow-hidden" : "gap-3")}
		>
			<header className={layout === "fill" ? "sr-only" : "flex items-center gap-2"}>
				<h3 ref={heading} tabIndex={-1} className="flex-1 text-sm font-medium">
					{run.name}
				</h3>
				<Badge>
					{connection.stopped || run.processStatus === "exited"
						? "Process exited"
						: connection.connection === "connecting"
							? "Connect terminal…"
							: connection.connection === "closed"
								? "Disconnected"
								: connection.controllable
									? "Process active"
									: "Process unknown"}
				</Badge>
			</header>
			<Suspense
				fallback={
					<p role="status" className="text-sm text-fg-muted">
						Load terminal…
					</p>
				}
			>
				<TerminalSurface
					identity={identity}
					createTransport={createTransport}
					onConnectionChange={setConnection}
					screenReaderMode={screenReaderMode}
					layout={layout}
					label={`Terminal input for ${run.name}`}
					readOnly={readOnly}
					stopped={run.processStatus === "exited"}
					onLeave={leave}
				/>
			</Suspense>
		</section>
	);
}
