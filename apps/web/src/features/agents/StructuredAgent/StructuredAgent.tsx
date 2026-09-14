import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { AgentConversation, Button, ConfirmDialog, Textarea, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

export function StructuredAgent({ run }: { run: AgentRun }) {
	const { client, orpc, queryClient } = useApp();
	const harness = useQuery({
		...orpc.agentRuns.harness.queryOptions({ input: { id: run.id } }),
		refetchInterval: 1000,
		retry: false,
	});
	const [text, setText] = useState("");
	const [approval, setApproval] = useState<{ requestId: string; behavior: "allow" | "deny" } | null>(null);
	const permission = useMutation({
		mutationFn: () => client.agentRuns.permission({ id: run.id, ...approval! }),
		onSuccess: async () => {
			setApproval(null);
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.harness.key() });
		},
		onError: (error) => toast.error("Could not answer the permission request", { description: error.message }),
	});
	const send = useMutation({
		mutationFn: (message: string) => client.agentRuns.send({ id: run.id, text: message }),
		onSuccess: async (_run, message) => {
			setText((current) => (current === message ? "" : current));
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.harness.key() });
		},
	});
	const current = harness.data;
	return (
		<div className="flex flex-col gap-4">
			{harness.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Read agent state…
				</p>
			) : (
				<AgentConversation
					state={harness.isError ? "unknown" : (current?.state ?? "unknown")}
					transcript={current?.transcript ?? []}
					result={current?.result ?? null}
					error={harness.error?.message ?? current?.error ?? null}
				/>
			)}
			{current?.pendingPermissions.map((request) => (
				<section
					key={request.requestId}
					aria-label={`Permission for ${request.toolName}`}
					className="flex flex-col gap-3 rounded-md border border-border p-3"
				>
					<h3 className="text-sm font-medium">{request.toolName} needs permission</h3>
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
						{JSON.stringify(request.input, null, 2)}
					</pre>
					<form
						className="flex justify-end gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							setApproval({ requestId: request.requestId, behavior: "allow" });
						}}
					>
						<Button
							type="button"
							variant="quiet"
							onClick={() => setApproval({ requestId: request.requestId, behavior: "deny" })}
						>
							Deny
						</Button>
						<Button type="submit" variant="primary">
							Allow once
						</Button>
					</form>
				</section>
			))}
			{current && (current.state === "idle" || current.state === "ready") && (
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (text.trim() && !send.isPending) send.mutate(text);
					}}
				>
					<Textarea
						label="Message to agent"
						value={text}
						onChange={(event) => setText(event.target.value)}
						maxLength={20000}
						rows={3}
					/>
					<Button className="self-end" type="submit" variant="primary" disabled={!text.trim() || send.isPending}>
						Send message
					</Button>
					{send.error && (
						<p role="alert" className="text-sm text-danger">
							{send.error.message}
						</p>
					)}
				</form>
			)}
			<ConfirmDialog
				open={approval !== null}
				title={approval?.behavior === "allow" ? "Allow this tool request?" : "Deny this tool request?"}
				description={
					approval?.behavior === "allow"
						? "The agent can execute the displayed request with your local user permissions. This approval applies to this request only."
						: "The agent receives a denial for this request."
				}
				confirmLabel={approval?.behavior === "allow" ? "Allow once" : "Deny"}
				processing={permission.isPending}
				onConfirm={() => permission.mutate()}
				onCancel={() => setApproval(null)}
			/>
		</div>
	);
}
