import { Check, X } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type AgentRun, HarnessSchema, hasAssignedProcess, type ReviewSubmit } from "@trellis/api";
import { IconButton, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { DraftNote } from "../DraftNote";

// A comment on a diff line reaches the agent on its own, so the bar offers
// the two verdicts only.
type Verdict = Exclude<ReviewSubmit["verdict"], "comment">;

const copy: Record<Verdict, { label: string; description: string; confirmLabel: string; noteRequired: boolean }> = {
	approve: {
		label: "Approve",
		description: "Save the approval in Trellis and tell the agent that the review passed.",
		confirmLabel: "Approve",
		noteRequired: false,
	},
	request_changes: {
		label: "Request changes",
		description: "Save the request in Trellis and deliver the note to the agent.",
		confirmLabel: "Request changes",
		noteRequired: true,
	},
};

const iconOf = (verdict: Verdict) => (verdict === "approve" ? <Check /> : <X />);

export function VerdictButton({
	pr,
	headSha,
	ticket,
	run,
	verdict,
	onDone,
}: {
	pr: string;
	headSha: string;
	ticket: string | null;
	run: AgentRun | null;
	verdict: Verdict;
	onDone: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const words = copy[verdict];
	const start = useMutation({
		mutationFn: async () => {
			if (ticket === null) return null;
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
		},
		onSuccess: (started) => {
			if (started) toast.success("The run started", { description: `${started.name} has ${ticket}.` });
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
		},
		onError: () => toast.error("The run did not start", { description: `Open ${ticket} and inspect its run.` }),
	});
	const submit = useMutation({
		// Every comment of the review already reached the agent, so the verdict
		// carries its note alone.
		mutationFn: () => client.reviews.submit({ pr, headSha, verdict, body: note, threadIds: [] }),
		onSuccess: (result) => {
			setOpen(false);
			setNote("");
			const recipient = run && result.submission.recipients.find((item) => item.runId === run.id);
			if (recipient && hasAssignedProcess(run))
				toast.success(`${words.label} delivered`, { description: `${recipient.agentName} has the verdict.` });
			else if (ticket)
				toast.success(`${words.label} saved`, {
					description: `No agent run can take the verdict. Start a run for ${ticket}.`,
					action: { label: "Start a run", onClick: () => start.mutate() },
				});
			else
				toast.success(`${words.label} saved`, {
					description: "No ticket links this pull request, so no agent can take the verdict.",
				});
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.reviews.key() });
			onDone();
		},
	});
	return (
		<>
			<Tooltip content={words.label}>
				<IconButton label={words.label} icon={iconOf(verdict)} onClick={() => setOpen(true)} />
			</Tooltip>
			<DraftNote
				open={open}
				title={words.label}
				description={words.description}
				confirmLabel={words.confirmLabel}
				note={note}
				noteRequired={words.noteRequired}
				error={submit.error ? "The server did not confirm the verdict. Refresh the page before you try again." : null}
				processing={submit.isPending}
				onNote={setNote}
				onConfirm={() => submit.mutate()}
				onCancel={() => {
					setOpen(false);
					setNote("");
					submit.reset();
				}}
			/>
		</>
	);
}
