import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { cx } from "../../utils/cx";

const countFormat = new Intl.NumberFormat();

export type ArchivedToggleProps = {
	expanded: boolean;
	onExpandedChange: (expanded: boolean) => void;
	semantics: "expanded" | "pressed";
	count?: number;
	className?: string;
};

export function ArchivedToggle({ expanded, onExpandedChange, semantics, count, className }: ArchivedToggleProps) {
	return (
		<button
			type="button"
			aria-expanded={semantics === "expanded" ? expanded : undefined}
			aria-pressed={semantics === "pressed" ? expanded : undefined}
			onClick={() => onExpandedChange(!expanded)}
			className={cx(
				"sidebar-row w-full text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg active:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
				className,
			)}
		>
			<span aria-hidden="true" className="sidebar-leading text-fg-faint *:size-3">
				{expanded ? <CaretDown /> : <CaretRight />}
			</span>
			<span className="sidebar-label">Archived</span>
			{count !== undefined && <span className="sidebar-trailing text-fg-faint">{countFormat.format(count)}</span>}
		</button>
	);
}
