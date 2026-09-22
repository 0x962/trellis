import { cx } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useSlashMenuStore } from "./SlashMenu";

// The block menu under the caret. It reads the plugin's state and hands a
// click back to the plugin's command.
export function SlashMenuList() {
	const { open, items, highlighted, left, top, pick } = useSlashMenuStore();
	const list = useRef<HTMLDivElement>(null);
	// The list scrolls, so the arrow keys keep the highlighted block in view.
	useEffect(() => {
		list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
	}, [highlighted, open]);
	if (!open) return null;
	return (
		<div
			ref={list}
			role="listbox"
			aria-label="Insert block"
			style={{ left, top }}
			className="fixed z-50 max-h-80 min-w-48 overflow-y-auto rounded-lg border border-border bg-elevated p-1 shadow-md"
		>
			{items.length === 0 && <div className="px-2 py-1.5 text-sm text-fg-muted">No block matches</div>}
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
						"flex h-7 w-full cursor-default items-center rounded-sm px-2 text-sm text-fg select-none",
						index === highlighted && "bg-bg",
					)}
				>
					<span className="flex-1 text-left">{block.label}</span>
					{block.hint !== "" && <span className="ml-4 font-mono text-xs text-fg-faint">{block.hint}</span>}
				</button>
			))}
		</div>
	);
}
