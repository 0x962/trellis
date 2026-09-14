export function FlowDecisionContext({
	title,
	instruction,
	outputs,
}: {
	title: string;
	instruction: string;
	outputs: { key: string; title: string; text: string }[];
}) {
	return (
		<section
			aria-label="Decision context"
			className="flex max-h-80 select-text flex-col gap-3 overflow-auto text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
		>
			<h3 className="font-medium">{title}</h3>
			<p className="whitespace-pre-wrap break-words">{instruction}</p>
			{outputs.length > 0 && (
				<section aria-label="Completed step output" className="flex flex-col gap-3 border-t border-border pt-3">
					<h4 className="font-medium">Completed step output</h4>
					{outputs.map((output) => (
						<div key={output.key} className="flex flex-col gap-2">
							<h5 className="font-medium text-fg-muted">{output.title}</h5>
							<pre className="whitespace-pre-wrap break-words font-mono text-xs">{output.text}</pre>
						</div>
					))}
				</section>
			)}
		</section>
	);
}
