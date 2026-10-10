import { useMutation } from "@tanstack/react-query";
import type { AgentSubagentsInput } from "@trellis/api";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useApp } from "../../../../../lib/appContext";
import { SubagentPager } from "./SubagentPager";

export function useWhiteboardSubagents(project: string, ids: readonly string[]) {
	const { client } = useApp();
	const pager = useMemo(() => new SubagentPager(project), [project]);
	const [, redraw] = useReducer((value: number) => value + 1, 0);
	const query = useMutation({
		mutationFn: ({ pager, runs }: { pager: SubagentPager; runs: AgentSubagentsInput["runs"] }) =>
			client.agentRuns.subagents({ project: pager.project, runs }),
		onSuccess: (pages, { pager }) => {
			pager.accept(pages);
			redraw();
		},
		onError: (_error, { pager, runs }) => {
			pager.reject(runs);
			redraw();
		},
		retry: false,
	});
	const { mutate } = query;
	const send = useCallback(
		(mode: Parameters<SubagentPager["take"]>[0]) => {
			const runs = pager.take(mode);
			if (runs.length > 0) mutate({ pager, runs });
		},
		[pager, mutate],
	);
	const idKey = JSON.stringify(ids);
	useEffect(() => {
		pager.setIds(JSON.parse(idKey));
		if (!query.isPending) send("initial");
		redraw();
	}, [pager, idKey, send, query.isPending]);
	useEffect(() => {
		const timer = window.setInterval(() => send("tail"), 5000);
		return () => window.clearInterval(timer);
	}, [send]);
	return {
		records: pager.records.filter((record) => ids.includes(record.parentRunId)),
		pending: query.isPending,
		error: pager.hasError && query.variables?.pager === pager ? query.error : null,
		partial: pager.partial,
		more: pager.more,
		load: () => send("more"),
	};
}
