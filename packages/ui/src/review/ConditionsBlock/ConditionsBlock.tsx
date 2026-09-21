import { PropertyRow } from "../../primitives/PropertyRow";
import { SectionHeader } from "../../primitives/SectionHeader";

export type ConditionsReadiness = "yes" | "not yet" | "merged";

export type ConditionLine = {
	// The word at the left of the line, such as "checks". Every label draws in
	// one column of the same width.
	label: string;
	// The answer, in words. The caller chooses the words.
	value: string;
};

export type ConditionsBlockProps = {
	// The word after the title `Ready to merge`. Without it, the block prints
	// the lines under the title `Merge conditions`, for a caller that cannot
	// measure every condition.
	readiness?: ConditionsReadiness;
	// The lines print in the order of this array.
	lines: readonly ConditionLine[];
};

// The merge conditions of a pull request, in words. Do not add a button or a
// link here. No condition may disable a control.
export function ConditionsBlock({ readiness, lines }: ConditionsBlockProps) {
	return (
		<section aria-label="Merge conditions" className="flex min-w-0 flex-col">
			{readiness === undefined ? (
				<SectionHeader title="Merge conditions" textCase="caps" />
			) : (
				<SectionHeader
					title="Ready to merge"
					textCase="caps"
					actions={
						<span role="status" aria-live="polite">
							{readiness}
						</span>
					}
				/>
			)}
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
