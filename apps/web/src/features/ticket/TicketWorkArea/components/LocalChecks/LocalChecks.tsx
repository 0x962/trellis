import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { LocalEvidence } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";

export function LocalChecks({ run }: { run: AgentRun }) {
	const { orpc } = useApp();
	const evidence = useQuery({
		...orpc.evidence.list.queryOptions({ input: { runId: run.id } }),
		refetchInterval: 10000,
	});
	if (evidence.isError)
		return (
			<p role="alert" className="text-sm text-danger">
				{evidence.error.message}
			</p>
		);
	if (evidence.isPending)
		return (
			<p role="status" className="text-sm text-fg-muted">
				Load local evidence…
			</p>
		);
	return <LocalEvidence {...evidence.data} />;
}
