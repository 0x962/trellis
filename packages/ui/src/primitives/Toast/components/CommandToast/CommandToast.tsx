import { Check } from "lucide-react";

export type CommandToastProps = {
	title: string;
	// The shell command the user pastes next, such as `trellis move CDE-1 in-progress`.
	command: string;
};

// The body of the Start-with-agent toast: a success line and the command in
// mono, ready to paste.
export function CommandToast({ title, command }: CommandToastProps) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-1.5 font-medium text-fg">
				<Check className="size-3.25 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
				{title}
			</div>
			<pre className="m-0 rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs leading-4 break-all whitespace-pre-wrap text-fg-muted">
				{command}
			</pre>
		</div>
	);
}
