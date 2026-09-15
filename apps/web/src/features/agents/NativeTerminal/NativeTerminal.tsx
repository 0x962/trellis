import type { AgentRun } from "@trellis/api";
import { Badge, cx, EmptyState } from "@trellis/ui";
import type { TerminalFrame, TerminalSurfaceProps } from "@trellis/ui/terminal";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { followTerminal, type TerminalProcess } from "./terminalStream";

const TerminalSurface = lazy(async () => ({ default: (await import("@trellis/ui/terminal")).TerminalSurface }));

export function NativeTerminal({
	run,
	layout = "panel",
	onLeave,
}: {
	run: AgentRun;
	layout?: TerminalSurfaceProps["layout"];
	onLeave?: () => void;
}) {
	const { client } = useApp();
	const heading = useRef<HTMLHeadingElement>(null);
	const [session, setSession] = useState<TerminalProcess | null>(null);
	const [connection, setConnection] = useState<"connecting" | "open" | "closed">("connecting");
	const follow = useCallback(
		async (offset: number, onOutput: (frame: TerminalFrame) => Promise<void>, signal: AbortSignal) => {
			setConnection("connecting");
			try {
				await followTerminal(
					{ id: run.id, terminalId: run.terminalId, sessionId: run.sessionId },
					offset,
					signal,
					onOutput,
					(next) => {
						setSession(next);
						setConnection("open");
					},
				);
			} finally {
				if (!signal.aborted) setConnection("closed");
			}
		},
		[run.id, run.terminalId, run.sessionId],
	);
	const send = useCallback(
		(text: string, userInput: boolean) =>
			client.agentRuns.terminalInput({ id: run.id, text, userInput, expectedTerminalId: run.terminalId! }),
		[client, run.id, run.terminalId],
	);
	const resize = useCallback(
		(cols: number, rows: number) =>
			client.agentRuns.resize({ id: run.id, cols, rows, expectedTerminalId: run.terminalId! }),
		[client, run.id, run.terminalId],
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
					{session?.status === "exited"
						? "Process exited"
						: connection === "connecting"
							? "Connect terminal…"
							: connection === "closed"
								? "Disconnected"
								: session?.controllable
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
					layout={layout}
					label={`Terminal input for ${run.name}`}
					connected={connection === "open" && session?.controllable === true}
					follow={follow}
					send={send}
					resize={resize}
					onLeave={leave}
				/>
			</Suspense>
		</section>
	);
}
