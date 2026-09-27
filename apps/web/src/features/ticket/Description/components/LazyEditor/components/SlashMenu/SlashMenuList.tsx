import { Command } from "@trellis/ui";
import { useSlashMenuStore } from "./SlashMenu";

// The block menu under the caret. It reads the plugin's state and hands a
// click back to the plugin's command.
export function SlashMenuList() {
	const { open, items, highlighted, left, top, pick } = useSlashMenuStore();
	if (!open) return null;
	return (
		<div
			style={{ left, top }}
			className="fixed z-50 min-w-48 rounded-lg border border-border bg-elevated shadow-md"
		>
			<Command.Root label="Insert block" value={items[highlighted]?.id ?? ""} shouldFilter={false}>
				<Command.List>
					{items.length === 0 && <Command.Empty>No block matches</Command.Empty>}
					{items.map((block) => (
						<Command.Row
							key={block.id}
							value={block.id}
							label={block.label}
							sub={block.hint === "" ? undefined : block.hint}
							mono
							onSelect={() => pick(block)}
						/>
					))}
				</Command.List>
			</Command.Root>
		</div>
	);
}
