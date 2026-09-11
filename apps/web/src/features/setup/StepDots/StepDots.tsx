import { cx } from "@trellis/ui";

export type StepDotsProps = {
	// The index of the current step: 0 for the name, 1 for the project.
	current: 0 | 1;
};

// Two 6 px dots for the two steps of the first run. The current step is the
// accent dot. The label says the same for assistive tech.
export function StepDots({ current }: StepDotsProps) {
	return (
		<span role="img" aria-label={`Step ${current + 1} of 2`} className="ml-auto flex items-center gap-1.5">
			{[0, 1].map((step) => (
				<span key={step} className={cx("size-1.5 rounded-sm", step === current ? "bg-accent" : "bg-border-strong")} />
			))}
		</span>
	);
}
