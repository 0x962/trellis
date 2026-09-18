import { ORPCError } from "@orpc/client";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Harness } from "@trellis/api";
import { Button } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { LaunchFields } from "../../../../../LaunchFields";

export function AssignmentForm({
	ticket,
	initialHarness,
	onClose,
}: {
	ticket: string;
	initialHarness: Harness;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const [harness, setHarness] = useState(initialHarness);
	const [requestId] = useState(() => crypto.randomUUID());
	const start = useMutation({
		mutationFn: () => client.agentRuns.start({ ticket, harness, requestId }),
		onSuccess: (run) => {
			queryClient.setQueryData(orpc.agentRuns.list.queryOptions({ input: { ticket } }).queryKey, (current) => [
				run,
				...(current ?? []).filter((item) => item.id !== run.id),
			]);
			onClose();
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			void navigate({ to: "/t/$identifier", params: { identifier: ticket }, hash: `attempt-${run.terminalId}` });
		},
	});
	const error =
		start.error instanceof ORPCError && start.error.code === "INPUT_VALIDATION_FAILED"
			? (start.error.data as { issues: { message: string }[] }).issues[0]!.message
			: start.error?.message;
	return (
		<form
			className="flex min-w-0 flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!start.isPending) start.mutate();
			}}
		>
			<fieldset disabled={start.isPending} className="flex min-w-0 flex-col gap-4">
				<LaunchFields harness={harness} onChange={setHarness} />
			</fieldset>
			{error && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button variant="quiet" onClick={onClose} disabled={start.isPending}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" disabled={start.isPending}>
					{start.isPending ? "Assign agent…" : "Assign"}
				</Button>
			</div>
		</form>
	);
}
