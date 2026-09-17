import type { AgentRun } from "@trellis/api";
import { Badge, cx, EmptyState } from "@trellis/ui";
import type { TerminalFrame, TerminalSurfaceProps } from "@trellis/ui/terminal";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { createTerminalSocket } from "./terminalSocket";
import type { TerminalProcess } from "./terminalStream";
import { terminalUnavailable } from "./terminalUnavailable";

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
	const transport = useRef<ReturnType<typeof createTerminalSocket> | null>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const [session, setSession] = useState<TerminalProcess | null>(null);
	const [connection, setConnection] = useState<"connecting" | "open" | "closed">("connecting");
	const follow = useCallback(
		async (offset: number, onOutput: (frame: TerminalFrame) => Promise<void>, signal: AbortSignal) => {
			setConnection("connecting");
			try {
				const current = createTerminalSocket({
					run: { id: run.id, terminalId: run.terminalId, sessionId: run.sessionId },
					offset,
					signal,
					onOutput,
					onSession: (next) => {
						setSession(next);
						setConnection("open");
					},
				});
				transport.current = current;
				await current.done;
			} finally {
				if (!signal.aborted) setConnection("closed");
			}
		},
		[run.id, run.terminalId, run.sessionId],
	);
	const send = useCallback(async (text: string, userInput: boolean) => {
		if (!transport.current) throw new Error("The terminal is not connected.");
		await transport.current.send(text, userInput);
	}, []);
	const resize = useCallback(async (cols: number, rows: number) => {
		if (!transport.current) throw new Error("The terminal is not connected.");
		await transport.current.resize(cols, rows);
	}, []);
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
					connected={!readOnly && connection === "open" && session?.controllable === true}
					stopped={run.processStatus === "exited" || session?.status === "exited"}
					unavailableReason={terminalUnavailable(session)}
					follow={follow}
					send={send}
					resize={resize}
					onLeave={leave}
				/>
			</Suspense>
		</section>
	);
}
