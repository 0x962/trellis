import { useQuery } from "@tanstack/react-query";
import { Button } from "@trellis/ui";
import { Bot } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunSheet } from "../AgentRunSheet";
import { PersonaPicker } from "./components/PersonaPicker";
export function TicketAgent({ ticket, disabled = false }: { ticket: string; disabled?: boolean }) {
	const { orpc } = useApp();
	const query = useQuery(orpc.agentRuns.list.queryOptions({ input: { ticket }, retry: false }));
	const [open, setOpen] = useState<"detail" | null>(null);
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
						<Button
							variant="quiet"
							align="start"
							icon={<Bot />}
							className="justify-start"
							onClick={() => setOpen("detail")}
						>
							{latest.name} · {latest.state}
						</Button>
					)}
					{!active && <PersonaPicker ticket={ticket} disabled={disabled} />}
				</>
			)}
			{open === "detail" && latest && <AgentRunSheet run={latest} onClose={() => setOpen(null)} />}
		</section>
	);
}
