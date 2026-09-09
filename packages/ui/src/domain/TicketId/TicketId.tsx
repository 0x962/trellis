import { cx } from "../../utils/cx";

export type TicketIdProps = {
	// The identifier, such as "CDE-43".
	id: string;
	size?: "sm" | "md";
	className?: string;
};

// A ticket identifier: mono, muted, tabular. 12 px in a row, 11 px on a card.
export function TicketId({ id, size = "md", className }: TicketIdProps) {
	return (
		<span
			className={cx(
				"font-mono text-fg-muted whitespace-nowrap tabular",
				size === "sm" ? "text-xs" : "text-sm",
				className,
			)}
		>
			{id}
		</span>
	);
}
