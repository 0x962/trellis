import { PropertyRow } from "../../primitives/PropertyRow";

export type ConditionsReadiness = "yes" | "not yet" | "merged";

export type ConditionLine = {
	// The word at the left of the line, such as "checks". Every label draws in
	// one column of the same width.
	label: string;
	// The answer, in words. The caller chooses the words.
	value: string;
};

export type ConditionsBlockProps = {
	readiness: ConditionsReadiness;
	// The lines print in the order of this array.
	lines: readonly ConditionLine[];
};

// The merge conditions of a pull request, in words. Do not add a button or a
// link here. No condition may disable a control.
export function ConditionsBlock({ readiness, lines }: ConditionsBlockProps) {
	return (
		<section aria-label="Merge conditions" className="flex min-w-0 flex-col">
			<div className="flex h-7 items-center gap-2">
				<h2 className="font-medium text-fg-faint text-xs uppercase tracking-[0.04em]">READY TO MERGE</h2>
				<span className="text-base text-fg">{readiness}</span>
			</div>
			<dl className="flex min-w-0 flex-col">
				{lines.map((line) => (
					<PropertyRow key={line.label} label={line.label} align="start">
						<span className="min-w-0 tabular">{line.value}</span>
					</PropertyRow>
				))}
			</dl>
		</section>
	);
}
