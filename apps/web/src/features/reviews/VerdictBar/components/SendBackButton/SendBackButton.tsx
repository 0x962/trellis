import { useMutation } from "@tanstack/react-query";
import { type AgentRun, HarnessSchema } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { hasAssignedProcess } from "../../../../agents/hasAssignedProcess";
import { sendBackError } from "../../sendBackError/sendBackError";
import { noRunResult, runStartFailure, sendBackLabel, sendBackResult } from "../../sendBackText/sendBackText";
import { DraftNote } from "../DraftNote";

export type SendBackButtonProps = {
	pr: string;
	// The commit the review sits on. `reviews.submit` refuses a thread that
	// sits on another commit.
	headSha: string;
	// The ticket that links this pull request, such as `TRL-203`.
	ticket: string;
	// The open agent assignment of the ticket, or null while the ticket has
	// none. A process that accepts input receives the review immediately.
	run: AgentRun | null;
	// The threads that leave with the click.
	drafts: readonly string[];
	onDone: () => void;
};

// `Send back` publishes the review before it starts a run. The submit result
// states whether `review_deliveries` has a recipient. If no process can take
// the review, the toast offers a separate run start.
export function SendBackButton({ pr, headSha, ticket, run, drafts, onDone }: SendBackButtonProps) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const close = () => {
		setOpen(false);
		setNote("");
		sendBack.reset();
	};
	const startRun = async () => {
		if (run === null)
			return client.agentRuns.start({
				ticket,
				harness: HarnessSchema.parse({ preset: "claude" }),
				requestId: crypto.randomUUID(),
			});
		if (hasAssignedProcess(run)) return run;
		return client.agentRuns.resume({
			id: run.id,
			expectedTerminalId: run.terminalId!,
			requestId: crypto.randomUUID(),
		});
	};
	const start = useMutation({
		mutationFn: startRun,
		onSuccess: (started) => {
			toast.success("The run started", { description: `${started.name} has ${ticket}.` });
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
		},
		onError: () => {
			toast.error("The run did not start", { description: runStartFailure(ticket) });
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
		},
	});
	const sendBack = useMutation({
		mutationFn: () =>
			client.reviews.submit({
				pr,
				headSha,
				verdict: "comment",
				body: note,
				threadIds: [...drafts],
				sendBack: true,
			}),
		onSuccess: (result) => {
			close();
			const recipient = run && result.submission.recipients.find((item) => item.runId === run.id);
			if (recipient && hasAssignedProcess(run))
				toast.success("The review went back", { description: sendBackResult(recipient.agentName) });
			else
				toast.success("The review is on GitHub", {
					description: noRunResult(ticket),
					action: { label: "Start a run", onClick: () => start.mutate() },
				});
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
			onDone();
		},
	});
	const label = sendBackLabel(run?.name ?? null);
	return (
		<>
			<Button onClick={() => setOpen(true)}>{label}</Button>
			<DraftNote
				open={open}
				title={label}
				description={`GitHub gets the note and the drafts. If no run can take them, start one for ${ticket}.`}
				confirmLabel="Send back"
				note={note}
				error={sendBackError(sendBack.error)}
				processing={sendBack.isPending}
				onNote={setNote}
				onConfirm={() => sendBack.mutate()}
				onCancel={close}
			/>
		</>
	);
}
