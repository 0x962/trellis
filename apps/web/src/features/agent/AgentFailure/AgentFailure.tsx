import { ORPCError } from "@orpc/client";
import type { AgentSession, AgentFailure as Failure } from "@trellis/api";
import { Button, Dialog, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { runnerReasonLine } from "../utils/runnerReasonLine";

export type AgentFailureProps = {
	// A session in the `failed` state, whose `failure` is therefore set.
	session: AgentSession;
};

// The runner prints one line for a short cause and a stack of lines for a
// long one. The short form takes the first line, and Details holds all of
// them.
const firstLine = (detail: string) => detail.trim().split("\n")[0] ?? "";

// What a refused retry says. The reason line names the fix, and the runner's
// own first line says what it printed.
const refusal = (error: unknown) => {
	if (!(error instanceof ORPCError) || error.code !== "RUNNER_UNAVAILABLE") return (error as Error).message;
	const failure = error.data as Failure;
	return `${runnerReasonLine[failure.reason]} ${firstLine(failure.detail)}`.trim();
};

// Why the runner refused a start, with the whole text one click away and a
// Retry that runs the start again. The reason line names the fix; the
// runner's own text follows it, because the fix for `error` is only in that
// text.
export function AgentFailure({ session }: AgentFailureProps) {
	const { client, orpc, queryClient } = useApp();
	const [open, setOpen] = useState(false);
	const [retrying, setRetrying] = useState(false);
	const failure = session.failure!;
	const printed = firstLine(failure.detail);

	const run = async () => {
		setRetrying(true);
		try {
			await client.agents.retry({ id: session.id });
			toast.success("Started the agent");
		} catch (error) {
			toast.error("Couldn't start the agent", { description: refusal(error) });
		} finally {
			setRetrying(false);
			await queryClient.invalidateQueries({ queryKey: orpc.agents.sessions.key() });
		}
	};

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2">
			<p role="alert" className="min-w-0 text-sm text-danger">
				{runnerReasonLine[failure.reason]}
				{printed !== "" && <span className="text-fg-muted"> {printed}</span>}
			</p>
			<Button size="sm" className="cursor-pointer" disabled={retrying} onClick={() => void run()}>
				Retry
			</Button>
			<Button size="sm" variant="quiet" className="cursor-pointer" onClick={() => setOpen(true)}>
				Details
			</Button>
			<Dialog
				open={open}
				onOpenChange={setOpen}
				size="lg"
				title={`${session.title} did not start`}
				description={
					failure.exitCode === null
						? runnerReasonLine[failure.reason]
						: `${runnerReasonLine[failure.reason]} Superset exited ${failure.exitCode}.`
				}
			>
				<pre className="max-h-80 overflow-auto rounded-md bg-bg p-3 font-mono text-sm text-fg whitespace-pre-wrap">
					{failure.detail === "" ? "Superset printed nothing." : failure.detail}
				</pre>
			</Dialog>
		</div>
	);
}
