import { ORPCError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Harness } from "@trellis/api";
import { Button, Select } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { hasAssignedProcess } from "../../../../../hasAssignedProcess";
import { LaunchFields } from "../../../../../LaunchFields";

export function AssignmentForm({
	ticket,
	defaults,
	onClose,
}: {
	ticket: string;
	defaults: { personaId: string | null; harness: Harness; accountId?: string | null };
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [personaId, setPersonaId] = useState(defaults.personaId ?? "");
	const [harness, setHarness] = useState(defaults.harness);
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const history = useQuery(orpc.agentRuns.list.queryOptions({ input: { ticket } }));
	const assigned = new Set((history.data ?? []).filter(hasAssignedProcess).map((run) => run.personaId));
	const choices = (personas.data ?? []).filter((persona) => persona.kind !== "manager" && !assigned.has(persona.id));
	const start = useMutation({
		mutationFn: () =>
			client.agentRuns.start({
				personaId,
				ticket,
				harness,
				accountId: harness.preset === defaults.harness.preset ? (defaults.accountId ?? undefined) : undefined,
			}),
		onSuccess: async (run) => {
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			if (run.state === "running" || run.state === "interrupted") onClose();
		},
	});
	const loadError = personas.error ?? history.error;
	const startError =
		start.error instanceof ORPCError && start.error.code === "INPUT_VALIDATION_FAILED"
			? (start.error.data as { issues: { message: string }[] }).issues[0]!.message
			: start.error?.message;
	const error = startError ?? (start.data?.state === "failed" ? start.data.error : null);
	return (
		<form
			className="flex min-w-0 flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!start.isPending) start.mutate();
			}}
		>
			<fieldset disabled={start.isPending} className="flex min-w-0 flex-col gap-4">
				<div className="flex min-w-0 flex-col gap-2">
					<span className="text-sm text-fg-muted">Persona</span>
					<Select
						label="Persona"
						placeholder="Select a persona"
						value={choices.some((persona) => persona.id === personaId) ? personaId : ""}
						items={choices.map((persona) => ({ value: persona.id, label: persona.name }))}
						onValueChange={setPersonaId}
					/>
				</div>
				<LaunchFields harness={harness} onChange={setHarness} />
			</fieldset>
			{personas.isPending || history.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load personas…
				</p>
			) : loadError ? (
				<p role="alert" className="text-sm text-danger">
					{loadError.message}
				</p>
			) : choices.length === 0 ? (
				<p className="text-sm text-fg-muted">No unassigned personas.</p>
			) : null}
			{error && (
				<p role="alert" className="text-sm text-danger">
					Could not start the agent. {error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button variant="quiet" onClick={onClose} disabled={start.isPending}>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					disabled={
						start.isPending || !!loadError || history.isPending || !choices.some((persona) => persona.id === personaId)
					}
				>
					{start.isPending ? "Start agent…" : "Assign"}
				</Button>
			</div>
		</form>
	);
}
