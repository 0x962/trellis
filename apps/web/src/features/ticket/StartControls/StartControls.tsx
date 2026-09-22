import { useMutation } from "@tanstack/react-query";
import { type Harness, HarnessSchema, type TicketSummary } from "@trellis/api";
import { StartControls as StartControlsView, type StartDependency } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { LaunchFields } from "../../agents/LaunchFields";

export type StartControlsProps = {
	// The identifier of the ticket the run takes, such as `TRL-188`.
	ticket: string;
	// The tickets that hold this ticket back. The server leaves out a ticket
	// that is done, so every entry here still holds the work back.
	waitsOn: TicketSummary["waitsOn"];
};

// `Start` stays live even when another ticket holds this ticket back. A
// person reads the line under the row and decides when a run starts.
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
	const dependencies = useMemo<StartDependency[]>(
		() =>
			waitsOn.map((dependency) => ({
				identifier: dependency.identifier,
				title: dependency.title,
				reason: "is not merged",
			})),
		[waitsOn],
	);
	return (
		<StartControlsView
			pickers={<LaunchFields harness={harness} onChange={setHarness} disabled={start.isPending} compact />}
			dependencies={dependencies}
			starting={start.isPending}
			error={start.error?.message ?? null}
			onStart={() => start.mutate()}
		/>
	);
}
