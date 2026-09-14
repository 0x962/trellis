type State = "ready" | "working" | "idle" | "needs_input" | "failed" | "unknown";
const labels: Record<State, string> = {
	ready: "Ready",
	working: "Working",
	idle: "Idle",
	needs_input: "Needs your input",
	failed: "Failed",
	unknown: "Agent state unknown",
};

export function AgentConversation({
	state,
	transcript,
	result,
	error,
}: {
	state: State;
	transcript: { role: "user" | "assistant"; text: string }[];
	result: string | null;
	error: string | null;
}) {
	return (
		<section aria-label="Agent conversation" className="flex flex-col gap-3">
			<p role="status" className="text-sm font-medium">
				{labels[state]}
			</p>
			{error && (
				<p role="alert" className="break-words text-sm text-danger">
					{error}
				</p>
			)}
			<section aria-label="Agent transcript">
				<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg p-3 font-mono text-sm">
					{transcript.length
						? transcript
								.slice(-30)
								.map((message) => `${message.role === "user" ? "Message" : "Agent"}\n${message.text}`)
								.join("\n\n")
						: "No conversation output yet."}
				</pre>
			</section>
			{transcript.length > 30 && <p className="text-xs text-fg-muted">The latest 30 messages appear here.</p>}
			{result && (
				<div className="flex flex-col gap-2">
					<h3 className="text-sm font-medium">Agent result</h3>
					<p className="whitespace-pre-wrap break-words text-sm">{result}</p>
					<p className="text-xs text-fg-muted">Review the output and checks before you accept this result.</p>
				</div>
			)}
		</section>
	);
}
