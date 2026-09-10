import { cx } from "@trellis/ui";
import { useSlashMenuStore } from "./SlashMenu";

// The block menu under the caret. It reads the plugin's state and hands a
// click back to the plugin's command.
export function SlashMenuList() {
	const { open, items, highlighted, left, top, pick } = useSlashMenuStore();
	if (!open) return null;
	return (
		<div
			role="listbox"
			aria-label="Insert block"
			style={{ left, top }}
			className="fixed z-50 min-w-40 rounded-lg border border-border bg-elevated p-1 shadow-md"
		>
			{items.length === 0 && <div className="px-2 py-1.5 text-sm text-fg-muted">No block</div>}
			{items.map((block, index) => (
				<button
					type="button"
					key={block.id}
					role="option"
					aria-selected={index === highlighted}
					tabIndex={index === highlighted ? 0 : -1}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => pick(block)}
					className={cx(
						"flex h-7 cursor-default items-center rounded-sm px-2 text-sm text-fg select-none",
						index === highlighted && "bg-bg",
					)}
				>
					{block.label}
				</button>
			))}
		</div>
	);
}
