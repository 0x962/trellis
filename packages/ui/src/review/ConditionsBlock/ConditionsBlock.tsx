import { PropertyRow } from "../../primitives/PropertyRow";

export type ConditionsReadiness = "yes" | "not yet" | "merged";

export type ConditionLine = {
	// The word at the left of the line, such as "checks". Every label draws in
	// one column of the same width.
	label: string;
	// The answer, in words. A condition that has no answer reads "unknown".
	value: string;
};

export type ConditionsBlockProps = {
	readiness: ConditionsReadiness;
	// The lines print in the order of this array.
	lines: readonly ConditionLine[];
};

// The merge conditions of a pull request, in words. The block holds no button
// and no link, so a condition never disables a control. The person reads the
// lines and decides.
export function ConditionsBlock({ readiness, lines }: ConditionsBlockProps) {
	return (
		<section aria-label="Merge conditions" className="flex min-w-0 flex-col">
			<div className="flex h-7 items-baseline gap-2">
				<h2 className="font-medium text-fg-muted text-sm tracking-wide">READY TO MERGE</h2>
				<span className="text-base text-fg">{readiness}</span>
			</div>
			<dl className="flex min-w-0 flex-col">
				{lines.map((line) => (
					<PropertyRow key={line.label} label={line.label} align="start">
						<span className="min-w-0 text-sm tabular">{line.value}</span>
					</PropertyRow>
				))}
			</dl>
		</section>
	);
}
