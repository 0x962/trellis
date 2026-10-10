import { useQueries } from "@tanstack/react-query";
import type { Epic } from "@trellis/api";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { pageSheetActions } from "../../../../../stores/pageSheetStore";
import { useEpicAgentRuns } from "../../hooks/useEpicAgentRuns";
import { useWhiteboardSubagents } from "./useWhiteboardSubagents";
import { whiteboardOutputs } from "./whiteboardOutputs";

export function useWhiteboardOutputs(epic: Epic) {
	const { orpc } = useApp();
	const runs = useEpicAgentRuns(epic.ref);
	const [bareRunIds, setBareRunIds] = useState<string[] | null>(null);
	const [openedSubagent, setOpenedSubagent] = useState<string | null>(null);
	const ids = [...new Set([...(bareRunIds ?? []), ...(runs.data ?? []).map((run) => run.id)])].sort();
	const batches = Array.from({ length: Math.ceil(ids.length / 200) }, (_, index) =>
		ids.slice(index * 200, index * 200 + 200),
	);
	const prs = useQueries({
		queries: batches.map((batch) =>
			orpc.agentRuns.pullRequests.queryOptions({ input: { ids: batch, project: epic.projectKey } }),
		),
	});
	const mapped = whiteboardOutputs(
		epic,
		runs.data ?? [],
		prs.flatMap((query) => query.data ?? []),
	);
	const subagents = useWhiteboardSubagents(epic.projectKey, ids);
	for (const record of subagents.records) {
		mapped.outputs.push({
			id: record.id,
			kind: "subagent",
			label: "Subagent output",
			profile: { provider: record.provider === "codex" ? "openai" : "anthropic", model: "Model not recorded" },
		});
		mapped.links.push({
			from: { kind: "session", id: record.parentRunId },
			to: { kind: "output", id: record.id },
			label: "Subagent",
		});
	}
	return {
		...mapped,
		ready: bareRunIds !== null && runs.isSuccess && prs.every((query) => query.isSuccess),
		error: runs.error ?? prs.find((query) => query.error)?.error ?? subagents.error,
		setBareRunIds,
		open: (id: string) => {
			const output = mapped.outputs.find((entry) => entry.id === id);
			if (output?.kind === "pull-request") pageSheetActions.openPullRequest(output.url);
			else setOpenedSubagent(id);
		},
		subagent:
			openedSubagent === null
				? null
				: {
						detail: subagents.records.find((record) => record.id === openedSubagent) ?? null,
						onClose: () => setOpenedSubagent(null),
						onOpenSource: () => {
							setOpenedSubagent(null);
							pageSheetActions.openSession(openedSubagent.split(":")[1]!);
						},
					},
		subagentLoad:
			ids.length === 0
				? null
				: { pending: subagents.pending, partial: subagents.partial, more: subagents.more, load: subagents.load },
	};
}
