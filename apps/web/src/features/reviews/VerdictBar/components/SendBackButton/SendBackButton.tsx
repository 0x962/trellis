import { useMutation } from "@tanstack/react-query";
import { type AgentRun, HarnessSchema } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { hasAssignedProcess } from "../../../../agents/hasAssignedProcess";
import { sendBackLabel, sendBackResult } from "../../sendBackText/sendBackText";
import { DraftNote } from "../DraftNote";

export type SendBackButtonProps = {
	pr: string;
	// The commit the review sits on. `reviews.submit` refuses a thread that
	// sits on another commit.
	headSha: string;
	// The ticket that links this pull request, such as `TRL-203`.
	ticket: string;
	// The open agent assignment of the ticket, or null while the ticket has
	// none. Its process can already be gone; the click then restarts it.
	run: AgentRun | null;
	// The threads that leave with the click.
	drafts: readonly string[];
	onDone: () => void;
};

// `Send back` gives the review to one agent on one ticket. The click makes
// that agent live, then publishes the review with `sendBack`, which queues
// one `review_deliveries` row for the agent. The delivery loop sends the
// message, so an agent that is still starting still reads the review.
export function SendBackButton({ pr, headSha, ticket, run, drafts, onDone }: SendBackButtonProps) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	// The name of the agent the review went to. The click can start that
	// agent, and the toast names the agent that took the review.
	const took = useRef("");
	const close = () => {
		setOpen(false);
		setNote("");
		took.current = "";
		sendBack.reset();
	};
	// The agent that takes the review. A live agent takes it as it is, an
	// agent whose process ended restarts with its own conversation and
	// workspace, and a ticket with no assignment gets a new agent.
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
			if (took.current === "") took.current = (await live()).name;
			await client.reviews.submit({
				pr,
				headSha,
				verdict: "comment",
				body: note,
				threadIds: [...drafts],
				sendBack: true,
			});
			return took.current;
		},
		onSuccess: (name) => {
			close();
			toast.success("The review went back", { description: sendBackResult(name) });
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
