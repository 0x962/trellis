import { useMutation } from "@tanstack/react-query";
import { type AgentRun, HarnessSchema } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { hasAssignedProcess } from "../../../../agents/hasAssignedProcess";
import { sendBackLabel, sendBackMessage, sendBackResult } from "../../sendBackText/sendBackText";
import { DraftNote } from "../DraftNote";

export type SendBackButtonProps = {
	pr: string;
	// The commit the review sits on. `reviews.submit` refuses a thread that
	// sits on another commit.
	headSha: string;
	// The ticket that links this pull request, such as `TRL-203`.
	ticket: string;
	// The open agent assignment of the ticket, or null while the ticket has
	// none. Its process can already be gone; the send then restarts it.
	run: AgentRun | null;
	// The threads that leave with the click.
	drafts: readonly string[];
	onDone: () => void;
};

// `Send back` gives the review to one agent on one ticket. The click posts
// the drafts, then makes that agent read them: a live agent takes a message,
// an agent whose process is gone restarts first, and a ticket with no
// assignment gets a new agent.
export function SendBackButton({ pr, headSha, ticket, run, drafts, onDone }: SendBackButtonProps) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	// True after the drafts reached GitHub. A send that fails after that point
	// keeps the dialog open, and the next click must not post them twice.
	const posted = useRef(false);
	const close = () => {
		setOpen(false);
		setNote("");
		posted.current = false;
		sendBack.reset();
	};
	const live = async () => {
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
	const sendBack = useMutation({
		mutationFn: async () => {
			if (!posted.current) {
				await client.reviews.submit({ pr, headSha, verdict: "comment", body: note, threadIds: [...drafts] });
				posted.current = true;
			}
			const agent = await live();
			await client.agentRuns.send({ id: agent.id, text: sendBackMessage({ pr, ticket, drafts: drafts.length }) });
			return agent;
		},
		onSuccess: (agent) => {
			close();
			toast.success("The review went back", { description: sendBackResult(agent.name) });
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() });
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
				description={`The agent reads the threads of this review and continues the work on ${ticket}.`}
				confirmLabel="Send back"
				note={note}
				error={sendBack.error?.message ?? null}
				processing={sendBack.isPending}
				onNote={setNote}
				onConfirm={() => sendBack.mutate()}
				onCancel={close}
			/>
		</>
	);
}
