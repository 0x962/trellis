import { Copy } from "@phosphor-icons/react";
import { IconButton, toast } from "@trellis/ui";

export type CliLineProps = {
	// The whole command, as one string.
	command: string;
};

// A shell command with a copy button, for the empty states.
export function CliLine({ command }: CliLineProps) {
	const copy = async () => {
		await navigator.clipboard.writeText(command);
		toast("Copied to the clipboard");
	};
	return (
		<div className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-border bg-surface pr-0.5 pl-2.5">
			<code className="truncate font-mono text-sm text-fg">{command}</code>
			<IconButton size="xs" label="Copy command" icon={<Copy />} onClick={copy} />
		</div>
	);
}
