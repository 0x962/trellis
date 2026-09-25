import { GroupHeader } from "@trellis/ui";
import type { ReactNode } from "react";
import { formatCount } from "../../../../../lib/format";

export type ResultGroupProps = {
	label: string;
	count: number;
	children: ReactNode;
	layout?: "table" | "list";
};

export function ResultGroup({ label, count, children, layout = "table" }: ResultGroupProps) {
	return (
		<section aria-label={label}>
			<GroupHeader
				group={label.toLowerCase()}
				label={label}
				count={formatCount(count)}
				collapsible={false}
				appearance="band"
			/>
			{layout === "list" ? (
				<ul aria-label={`${label} search results`}>{children}</ul>
			) : (
				<table
					// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: The keyboard treats each result as one selectable grid row.
					role="grid"
					aria-label={`${label} search results`}
					className="w-full table-fixed border-collapse"
				>
					<tbody>{children}</tbody>
				</table>
			)}
		</section>
	);
}
