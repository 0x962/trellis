import { ORPCError } from "@orpc/client";
import type { AgentRun } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import type { DesktopBridge } from "../../../lib/desktopBridge";

export function useSessionAttention(run: AgentRun, enabled = true) {
	const { client, orpc, queryClient } = useApp();
	const sequence = run.observation?.attention?.completion?.sequence;
	const attemptId = run.terminalId;
	const acknowledged = run.seenAttention?.attemptId === attemptId ? run.seenAttention.sequence : 0;
	useEffect(() => {
		const desktop = (window as Window & { trellisDesktop?: DesktopBridge }).trellisDesktop;
		let submitted = false;
		const owner = crypto.randomUUID();
		const clearVisible = () => {
			const visible = JSON.parse(localStorage.getItem("trellis-visible-session") ?? "null") as { owner: string } | null;
			if (visible?.owner === owner) localStorage.removeItem("trellis-visible-session");
			void desktop?.sessionVisible?.(null);
		};
		const mark = () => {
			if (document.hidden || !document.hasFocus()) {
				clearVisible();
				return;
			}
			localStorage.setItem("trellis-visible-session", JSON.stringify({ owner, runId: run.id, at: Date.now() }));
			void desktop?.sessionVisible?.(run.id);
			if (!enabled || submitted || sequence === undefined || sequence <= acknowledged || attemptId === null) return;
			submitted = true;
			void client.agentRuns
				.seen({ id: run.id, attemptId, sequence })
				.then(() => queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }))
				.catch((error: Error) => {
					if (error instanceof ORPCError && error.code === "SESSION_ATTENTION_CHANGED") {
						void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
						void queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
						return;
					}
					toast.error("The session could not be marked as seen.", { description: error.message });
				});
		};
		mark();
		const timer = window.setInterval(mark, 1000);
		window.addEventListener("focus", mark);
		window.addEventListener("blur", clearVisible);
		document.addEventListener("visibilitychange", mark);
		return () => {
			clearInterval(timer);
			window.removeEventListener("focus", mark);
			window.removeEventListener("blur", clearVisible);
			document.removeEventListener("visibilitychange", mark);
			clearVisible();
		};
	}, [run.id, attemptId, sequence, acknowledged, enabled, client, orpc, queryClient]);
}
