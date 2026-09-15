import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { followTerminal, type TerminalProcess } from "../../../agents/NativeTerminal/terminalStream";

export function useNativeAttention() {
	const { orpc } = useApp();
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: {} }));
	const [observations, setObservations] = useState<Record<string, { session?: TerminalProcess; error?: string }>>({});
	useEffect(() => {
		const controllers = (runs.data ?? [])
			.filter(
				(run) => run.runtime === "native" && run.terminalId !== null && !["stopped", "exited"].includes(run.state),
			)
			.map((run) => {
				const controller = new AbortController();
				void followTerminal(
					run,
					0,
					controller.signal,
					async () => {},
					(session) => {
						setObservations((previous) => ({ ...previous, [run.terminalId!]: { session } }));
					},
				).catch((error: Error) => {
					if (!controller.signal.aborted)
						setObservations((previous) => ({ ...previous, [run.terminalId!]: { error: error.message } }));
				});
				return controller;
			});
		return () => {
			for (const controller of controllers) controller.abort();
		};
	}, [runs.data]);
	const items = (runs.data ?? []).flatMap((run) => {
		if (run.runtime !== "native" || ["stopped", "exited"].includes(run.state)) return [];
		const current = observations[run.terminalId!];
		const reason =
			current?.error ??
			current?.session?.error ??
			(current?.session?.status === "unknown"
				? "The local process needs inspection."
				: run.state === "failed" || run.state === "interrupted"
					? run.error
					: null);
		return reason ? [{ run, reason }] : [];
	});
	return { items, error: runs.error };
}
