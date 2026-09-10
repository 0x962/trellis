import { Input } from "@trellis/ui";
import { Plus } from "lucide-react";
import { useState } from "react";

export type QuickAddProps = {
	columnName: string;
	onCreate: (title: string) => Promise<void>;
	onFullComposer: (title: string) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

export function QuickAdd({ columnName, onCreate, onFullComposer, open, onOpenChange }: QuickAddProps) {
	const [localOpen, setLocalOpen] = useState(false);
	const [title, setTitle] = useState("");
	const active = open ?? localOpen;
	const setActive = (next: boolean) => {
		setLocalOpen(next);
		onOpenChange?.(next);
	};

	if (!active) {
		return (
			<button
				type="button"
				onClick={() => setActive(true)}
				className="flex h-8 w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-base text-fg-faint transition-colors duration-hover ease-out hover:border-border-strong hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
			>
				<Plus aria-hidden="true" className="size-3.5" />
				New ticket
			</button>
		);
	}

	return (
		<form
			className="rounded-md border border-accent bg-surface p-2 shadow-sm"
			onSubmit={(event) => {
				event.preventDefault();
				void onCreate(title).then(() => setTitle(""));
			}}
		>
			<Input
				autoFocus
				label={`New ticket title in ${columnName}`}
				hideLabel
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						setTitle("");
						setActive(false);
					}
					if (event.key === "Enter" && event.shiftKey) {
						event.preventDefault();
						onFullComposer(title);
						setTitle("");
						setActive(false);
					}
				}}
			/>
			<p className="mt-1 text-xs text-fg-faint">Enter creates the ticket. Shift+Enter opens New ticket. Esc cancels.</p>
		</form>
	);
}
