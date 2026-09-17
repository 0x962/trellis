import { Badge } from "../../primitives/Badge";

export function RuntimeDiagnostics({
	runtime,
	queue,
	lastObservationAt,
	unresolvedAttempts,
	logs,
}: {
	runtime: { state: string; protocol: number | null; expectedProtocol: number; error: string | null };
	queue: { pending: number; sending: number; unknown: number; oldestDueAt: string | null };
	lastObservationAt: string | null;
	unresolvedAttempts: { id: string; state: string; error: string | null }[];
	logs: string[];
}) {
	return (
		<section aria-label="Runtime diagnostics" className="flex min-w-0 flex-col gap-4 py-4">
			<Badge tone={runtime.state === "running" ? "ok" : "neutral"}>Execution service: {runtime.state}</Badge>
			{runtime.error && (
				<p role="alert" className="text-sm text-danger">
					{runtime.error}
				</p>
			)}
			<dl className="grid grid-cols-2 gap-3 text-sm tabular-nums">
				<dt>Protocol</dt>
				<dd>
					{runtime.protocol ?? "Unavailable"} (expected {runtime.expectedProtocol})
				</dd>
				<dt>Pending messages</dt>
				<dd>{queue.pending}</dd>
				<dt>Messages in progress</dt>
				<dd>{queue.sending}</dd>
				<dt>Unknown deliveries</dt>
				<dd>{queue.unknown}</dd>
				<dt>Oldest message due</dt>
				<dd className="break-all">{queue.oldestDueAt ?? "None"}</dd>
				<dt>Last agent observation</dt>
				<dd className="break-all">{lastObservationAt ?? "None"}</dd>
			</dl>
			{unresolvedAttempts.length > 0 && (
				<>
					<p className="text-sm">Inspect unresolved attempts and their workspaces before you start replacements.</p>
					<ul className="flex flex-col gap-3">
						{unresolvedAttempts.map((attempt) => (
							<li key={attempt.id} className="border border-border p-3 text-sm">
								<code className="break-all font-mono">{attempt.id}</code>
								<p>{attempt.state}</p>
								{attempt.error && <p className="text-danger">{attempt.error}</p>}
							</li>
						))}
					</ul>
				</>
			)}
			<div className="text-sm">
				<h3 className="font-medium">Local logs</h3>
				<ul>
					{logs.map((path) => (
						<li key={path} className="break-all font-mono text-xs">
							{path}
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
