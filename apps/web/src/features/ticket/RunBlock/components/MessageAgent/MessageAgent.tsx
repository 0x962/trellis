import { useMutation } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Button, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

export type MessageAgentProps = {
	// The assigned agent run of the ticket, with a live process.
	run: AgentRun;
};

// A follow-up to the agent that works on the ticket. The text reaches the
// agent the way `trellis agents send` sends it: as the next user message of
// its session. Cmd+Enter or Ctrl+Enter sends too.
export function MessageAgent({ run }: MessageAgentProps) {
	const { client } = useApp();
	const [text, setText] = useState("");
	const send = useMutation({
		mutationFn: (message: string) => client.agentRuns.send({ id: run.id, text: message }),
		onSuccess: () => setText(""),
	});
	const ready = text.trim() !== "" && !send.isPending;
	return (
		<form
			aria-label="Message the agent"
			className="flex min-w-0 flex-col gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				if (ready) send.mutate(text);
			}}
		>
			<Textarea
				label={`Message ${run.name}`}
				hideLabel
				rows={2}
				value={text}
				placeholder={`Message ${run.name}`}
				disabled={send.isPending}
				onChange={(event) => {
					setText(event.target.value);
					if (send.isSuccess || send.isError) send.reset();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && ready) {
						event.preventDefault();
						send.mutate(text);
					}
				}}
			/>
			<div className="flex min-w-0 items-center gap-3">
				<Button type="submit" variant="primary" processing={send.isPending} disabled={text.trim() === ""}>
					Send
				</Button>
				{send.isSuccess && (
					<p role="status" className="min-w-0 text-sm text-fg-muted">
						{run.name} has the message.
					</p>
				)}
			</div>
			{send.isError && (
				<p role="alert" className="text-sm text-danger">
					{send.error.message}
				</p>
			)}
		</form>
	);
}
