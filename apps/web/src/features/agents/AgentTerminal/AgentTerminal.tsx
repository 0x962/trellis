import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { useApp } from "../../../lib/appContext";
import { NativeTerminal } from "../NativeTerminal";

export function AgentTerminal({ run }: { run: AgentRun }) {
	return run.runtime === "native" ? <NativeTerminal run={run} /> : <SavedOutput run={run} />;
}

function SavedOutput({ run }: { run: AgentRun }) {
	const { orpc } = useApp();
	const output = useQuery(orpc.agentRuns.output.queryOptions({ input: { id: run.id }, retry: false }));
	return (
		<section aria-label="Saved agent output" className="flex flex-col gap-3">
			<h2 className="text-sm font-medium">Saved terminal output</h2>
			{output.isError ? (
				<p role="alert" className="text-sm text-danger">
					{output.error.message}
				</p>
			) : (
				<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg p-3 font-mono text-xs text-fg-muted">
					{output.data?.text ?? "Load saved output…"}
				</pre>
			)}
		</section>
	);
}
