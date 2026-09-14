import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Button, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { NativeTerminal } from "../NativeTerminal";

// How often the page reads the terminal again, in ms.
const readEveryMs = 5000;

// True while the agent still holds its terminal and can write more.
const atWork = (run: AgentRun) => run.state === "starting" || run.state === "running" || run.state === "interrupted";

export function AgentTerminal({ run }: { run: AgentRun }) {
	return run.runtime === "native" ? <NativeTerminal run={run} /> : <CommandTerminal run={run} />;
}

function CommandTerminal({ run }: { run: AgentRun }) {
	const { client, orpc, queryClient } = useApp();
	const output = useQuery({
		...orpc.agentRuns.output.queryOptions({ input: { id: run.id }, retry: false }),
		enabled: run.terminalId !== null,
		// The page reads the terminal again every few seconds for as long as
		// the agent holds it, so the output follows the agent with no button
		// to press. An agent that stopped or exited writes nothing more.
		refetchInterval: atWork(run) ? readEveryMs : false,
	});
	const [text, setText] = useState("");
	const send = useMutation({
		mutationFn: () => client.agentRuns.send({ id: run.id, text }),
		onSuccess: async () => {
			setText("");
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.output.key() });
		},
	});
	return (
		<section aria-label="Agent terminal" className="flex flex-col gap-3">
			<header className="flex items-center gap-2">
				<h2 className="text-sm font-medium">Terminal output</h2>
			</header>
			{output.isError ? (
				<p role="alert" className="text-sm text-danger">
					Could not read the terminal. {output.error.message}
				</p>
			) : (
				<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg p-3 font-mono text-xs text-fg-muted">
					{output.data?.text ?? (run.terminalId ? "Load output…" : "The agent has no terminal yet.")}
				</pre>
			)}
			{run.state === "running" && (
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (text.trim() && !send.isPending) send.mutate();
					}}
				>
					<Textarea
						label="Follow-up"
						rows={3}
						maxLength={20000}
						value={text}
						disabled={send.isPending}
						onChange={(event) => setText(event.target.value)}
					/>
					<Button type="submit" variant="primary" className="self-end" disabled={!text.trim() || send.isPending}>
						Send follow-up
					</Button>
					{send.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not send the follow-up. {send.error.message}
						</p>
					)}
				</form>
			)}
		</section>
	);
}
