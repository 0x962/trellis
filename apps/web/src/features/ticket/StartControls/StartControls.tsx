import { useMutation } from "@tanstack/react-query";
import { type Harness, HarnessSchema, type TicketSummary } from "@trellis/api";
import { type StartBlocker, StartControls as StartControlsView } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { LaunchFields } from "../../agents/LaunchFields";
import { dependencyWords } from "../dependencyWords";

export type StartControlsProps = {
	// The identifier of the ticket the run takes, such as `TRL-188`.
	ticket: string;
	// The tickets that hold this ticket back. The server leaves out a ticket
	// that is done, so every entry here still holds the work back.
	waitsOn: TicketSummary["waitsOn"];
};

// This wrapper holds the harness the pickers write, names each ticket that
// holds the work back, and starts the run. `Start` stays live while the
// ticket waits for another ticket: the person reads the line and decides.
export function StartControls({ ticket, waitsOn }: StartControlsProps) {
	const { client, orpc, queryClient } = useApp();
	const [harness, setHarness] = useState<Harness>(() => HarnessSchema.parse({ preset: "claude" }));
	const [requestId] = useState(() => crypto.randomUUID());
	const start = useMutation({
		mutationFn: () => client.agentRuns.start({ ticket, harness, requestId }),
		onSuccess: (run) => {
			queryClient.setQueryData(orpc.agentRuns.list.queryOptions({ input: { ticket } }).queryKey, (current) => [
				run,
				...(current ?? []).filter((item) => item.id !== run.id),
			]);
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
		},
	});
	const blockers = useMemo<StartBlocker[]>(
		() =>
			waitsOn.map((dependency) => ({
				identifier: dependency.identifier,
				title: dependency.title,
				words: dependencyWords(dependency),
			})),
		[waitsOn],
	);
	return (
		<StartControlsView
			pickers={<LaunchFields harness={harness} onChange={setHarness} disabled={start.isPending} compact />}
			blockers={blockers}
			starting={start.isPending}
			error={start.error?.message ?? null}
			onStart={() => start.mutate()}
		/>
	);
}
