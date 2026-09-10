import { Dialog, Kbd } from "@trellis/ui";
import { useShortcutsStore } from "./shortcutsStore";

// The global keys. A sequence is two keys within 800 ms.
const shortcuts: { keys: string[]; action: string }[] = [
	{ keys: ["g", "h"], action: "Go to Needs you" },
	{ keys: ["g", "a"], action: "Go to All tickets" },
	{ keys: ["g", "p"], action: "Go to a project" },
	{ keys: ["g", "b"], action: "Board view of this project" },
	{ keys: ["g", "t"], action: "Table view of this project" },
	{ keys: ["g", "s"], action: "Focus the filter bar" },
	{ keys: ["["], action: "Toggle the sidebar" },
	{ keys: ["⌘", "\\"], action: "Toggle the theme" },
	{ keys: ["?"], action: "This help" },
];

// The keyboard help, opened by `?` and by the help button in the sidebar.
export function ShortcutsDialog() {
	const open = useShortcutsStore((state) => state.open);
	const setOpen = useShortcutsStore((state) => state.setOpen);
	return (
		<Dialog
			open={open}
			onOpenChange={setOpen}
			title="Keyboard shortcuts"
			description="Global keys. A letter key does nothing while you type in a field."
		>
			<ul className="flex flex-col gap-2">
				{shortcuts.map((shortcut) => (
					<li key={shortcut.action} className="flex items-center gap-3">
						<span className="flex w-16 shrink-0 items-center gap-1">
							{shortcut.keys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</span>
						<span className="text-fg-muted">{shortcut.action}</span>
					</li>
				))}
			</ul>
		</Dialog>
	);
}
