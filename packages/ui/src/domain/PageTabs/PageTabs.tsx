import { Plus, X } from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type PageTab = {
	id: string;
	title: string;
};

export type PageTabsProps = {
	tabs: readonly PageTab[];
	activeId: string;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	"aria-label"?: string;
};

const moveKeys = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

export function PageTabs({
	tabs,
	activeId,
	onAdd,
	onSelect,
	onClose,
	"aria-label": ariaLabel = "Open pages",
}: PageTabsProps) {
	const tabElements = useRef(new Map<string, HTMLButtonElement>());
	const focusActiveAfterClose = useRef(false);

	useEffect(() => {
		const activeTab = tabElements.current.get(activeId);
		activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
		if (focusActiveAfterClose.current) activeTab?.focus();
		focusActiveAfterClose.current = false;
	}, [activeId]);

	const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
		if (!moveKeys.has(event.key)) return;
		event.preventDefault();
		const current = tabs.findIndex((tab) => tab.id === id);
		const next =
			event.key === "Home"
				? tabs[0]
				: event.key === "End"
					? tabs.at(-1)
					: tabs[(current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
		if (!next) return;
		tabElements.current.get(next.id)?.focus();
		onSelect(next.id);
	};

	return (
		<div className="flex min-w-0 items-end border-b border-border bg-surface px-1 text-sm">
			<div role="tablist" aria-label={ariaLabel} className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
				{tabs.map((tab) => {
					const active = tab.id === activeId;
					return (
						<div
							key={tab.id}
							className={cx(
								"flex shrink-0 items-center rounded-t-md border-x border-t",
								active ? "border-border bg-bg text-fg" : "border-transparent text-fg-muted hover:bg-fg/6 hover:text-fg",
							)}
						>
							<button
								ref={(element) => {
									if (element) tabElements.current.set(tab.id, element);
									else tabElements.current.delete(tab.id);
								}}
								type="button"
								role="tab"
								aria-selected={active}
								tabIndex={active ? 0 : -1}
								title={tab.title}
								className={cx(
									"h-8 max-w-64 min-w-0 truncate rounded-tl-md px-2 font-medium select-none",
									"focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
									hitArea.tab32,
								)}
								onClick={() => onSelect(tab.id)}
								onKeyDown={(event) => onTabKeyDown(event, tab.id)}
							>
								{tab.title}
							</button>
							<Tooltip content={`Close ${tab.title}`}>
								<IconButton
									label={`Close ${tab.title}`}
									icon={<X />}
									size="xs"
									tabIndex={active ? 0 : -1}
									className="mr-1"
									onClick={(event) => {
										focusActiveAfterClose.current = event.detail === 0;
										onClose(tab.id);
									}}
								/>
							</Tooltip>
						</div>
					);
				})}
			</div>
			<div className="flex shrink-0 items-center border-l border-border bg-surface pl-1">
				<Tooltip content="Add tab">
					<IconButton label="Add tab" icon={<Plus />} size="xs" onClick={onAdd} />
				</Tooltip>
			</div>
		</div>
	);
}
