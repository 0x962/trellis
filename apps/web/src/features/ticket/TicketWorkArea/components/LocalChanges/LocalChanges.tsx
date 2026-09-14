import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { WorkspaceChanges } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

export function LocalChanges({ run }: { run: AgentRun }) {
	const { orpc } = useApp();
	const [selected, setSelected] = useState("");
	const workspace = useQuery({
		...orpc.evidence.workspace.queryOptions({ input: { runId: run.id } }),
		refetchInterval: 10000,
	});
	const file = useQuery({
		...orpc.evidence.file.queryOptions({ input: { runId: run.id, path: selected } }),
		enabled: selected !== "",
		refetchInterval: selected === "" ? false : 10000,
	});
	if (workspace.isError)
		return (
			<p role="alert" className="text-sm text-danger">
				{workspace.error.message}
			</p>
		);
	if (workspace.isPending)
		return (
			<p role="status" className="text-sm text-fg-muted">
				Load workspace…
			</p>
		);
	return (
		<WorkspaceChanges
			files={workspace.data.files}
			diff={workspace.data.diff}
			truncated={workspace.data.truncated}
			selected={selected}
			onSelect={setSelected}
			content={file.data}
			pending={selected !== "" && file.isPending}
			error={file.error?.message}
		/>
	);
}
