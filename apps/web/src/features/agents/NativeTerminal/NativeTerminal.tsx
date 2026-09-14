import { Terminal, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Badge, IconButton, Tooltip } from "@trellis/ui";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { StructuredAgent } from "../StructuredAgent";

const TerminalSurface = lazy(async () => ({ default: (await import("@trellis/ui/terminal")).TerminalSurface }));

export function NativeTerminal({ run }: { run: AgentRun }) {
	const { client, orpc } = useApp();
	const [open, setOpen] = useState(false);
	const close = useRef<HTMLButtonElement>(null);
	const session = useQuery({
		...orpc.agentRuns.session.queryOptions({ input: { id: run.id } }),
		refetchInterval: 2000,
		retry: false,
	});
	const load = useCallback(
		(offset: number) => client.agentRuns.terminalOutput({ id: run.id, offset }),
		[client, run.id],
	);
	const send = useCallback(
		(text: string) =>
			client.agentRuns.terminalInput({ id: run.id, text, expectedTerminalId: run.terminalId ?? undefined }),
		[client, run.id, run.terminalId],
	);
	const resize = useCallback(
		(cols: number, rows: number) =>
			client.agentRuns.resize({ id: run.id, cols, rows, expectedTerminalId: run.terminalId ?? undefined }),
		[client, run.id, run.terminalId],
	);
	const leave = useCallback(() => close.current?.focus(), []);
	if (session.data?.mode === "stdio") return <StructuredAgent run={run} />;
	return (
		<section aria-label={`Terminal for ${run.name}`} className="flex min-w-0 flex-col gap-3">
			<header className="flex items-center gap-2">
				<h3 className="flex-1 text-sm font-medium">Local terminal</h3>
				<Badge>
					{session.isPending
						? "Read process…"
						: session.isError
							? "Connection unknown"
							: session.data?.status === "running"
								? "Process active"
								: (session.data?.status ?? "No process")}
				</Badge>
				<Tooltip content={open ? "Close terminal view" : "Open terminal view"}>
					<IconButton
						ref={close}
						label={open ? "Close terminal view" : "Open terminal view"}
						icon={open ? <X /> : <Terminal />}
						onClick={() => setOpen(!open)}
					/>
				</Tooltip>
			</header>
			{session.isError && (
				<p role="alert" className="text-sm text-danger">
					{session.error.message}
				</p>
			)}
			{open && (
				<Suspense
					fallback={
						<p role="status" className="text-sm text-fg-muted">
							Load terminal…
						</p>
					}
				>
					<TerminalSurface
						key={run.terminalId}
						label={`Terminal input for ${run.name}`}
						connected={run.terminalId !== null && session.data?.status === "running"}
						load={load}
						send={send}
						resize={resize}
						onLeave={leave}
					/>
				</Suspense>
			)}
			{!open && (
				<p className="text-sm text-fg-muted">
					The process continues when this view closes. Process activity does not confirm a completed task.
				</p>
			)}
		</section>
	);
}
