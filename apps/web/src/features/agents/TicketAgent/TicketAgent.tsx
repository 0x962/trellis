import { useQuery } from "@tanstack/react-query";
import { Button } from "@trellis/ui";
import { Bot, Plus } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunSheet } from "../AgentRunSheet";
import { AgentStartSheet } from "../AgentStartSheet";
export function TicketAgent({ ticket, disabled = false }: { ticket: string; disabled?: boolean }) {
	const { orpc } = useApp();
	const query = useQuery(orpc.agentRuns.list.queryOptions({ input: { ticket }, retry: false }));
	const [open, setOpen] = useState<"start" | "detail" | null>(null);
	const active = query.data?.find(
		(run) => run.state === "starting" || run.state === "interrupted" || run.state === "running",
	);
	const latest = active ?? query.data?.[0];
	return (
		<section aria-label="Agent assignment" className="flex flex-col gap-2 border-t border-border py-3">
			<h3 className="text-xs font-medium text-fg-faint">Agent</h3>
			{query.isPending ? (
				<p role="status" className="text-sm text-fg-faint">
					Load agents…
				</p>
			) : query.isError ? (
				<p role="alert" className="text-sm text-danger">
					Could not load agents.{" "}
					<Button variant="quiet" onClick={() => void query.refetch()}>
						Retry
					</Button>
				</p>
			) : (
				<>
					{latest && (
						<Button variant="quiet" icon={<Bot />} className="justify-start" onClick={() => setOpen("detail")}>
							{latest.name} · {latest.state}
						</Button>
					)}
					{!active && (
						<Button
							variant="quiet"
							icon={<Plus />}
							disabled={disabled}
							className="justify-start"
							onClick={() => setOpen("start")}
						>
							New agent
						</Button>
					)}
				</>
			)}
			{open === "start" && <AgentStartSheet ticket={ticket} onClose={() => setOpen(null)} />}
			{open === "detail" && latest && <AgentRunSheet run={latest} onClose={() => setOpen(null)} />}
		</section>
	);
}
