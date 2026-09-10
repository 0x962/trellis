import { Button, Input } from "@trellis/ui";
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
			<Button
				variant="quiet"
				size="sm"
				icon={<Plus />}
				className="h-9 w-full justify-start border-dashed text-fg-faint"
				onClick={() => setActive(true)}
			>
				New ticket
			</Button>
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
					}
				}}
			/>
			<p className="mt-1 text-xs text-fg-faint">Enter creates. Shift+Enter opens the full composer. Esc cancels.</p>
		</form>
	);
}
