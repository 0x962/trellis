import { Check } from "@phosphor-icons/react";

export type CommandToastProps = {
	title: string;
	// The text that went to the clipboard, such as `trellis move CDE-1 in-progress`.
	command: string;
};

// The body of a copy toast: the success line, then the copied text in mono
// on one line. A long text truncates; the clipboard holds all of it.
export function CommandToast({ title, command }: CommandToastProps) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<div className="flex items-center gap-1.5 text-sm font-medium text-fg">
				<Check className="size-3 shrink-0 text-success" weight="bold" aria-hidden="true" />
				{title}
			</div>
			<span className="truncate font-mono text-xs text-fg-muted">{command}</span>
		</div>
	);
}
