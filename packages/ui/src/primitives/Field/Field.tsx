import { cloneElement, type ReactElement, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";

export type FieldProps = {
	// The visible label. A click on it reaches the control.
	label: string;
	// With `hideLabel` the label is read to assistive tech only, as `Input`
	// does it. The control keeps its own accessible name.
	hideLabel?: boolean;
	// One line under the control that says what the value does.
	hint?: ReactNode;
	// The control. It takes the id of the label through its `id` prop.
	children: ReactElement<{ id?: string }>;
	className?: string;
};

// The label, the control and the hint of one form field, with the spacing
// `Input` uses. `Input` and `Textarea` draw their own label, so this wraps a
// control that draws none, such as `Select`.
export function Field({ label, hideLabel = false, hint, children, className }: FieldProps) {
	const id = useId();
	return (
		<div className={cx("flex min-w-0 flex-col gap-1", className)}>
			<label htmlFor={id} className={cx("text-sm text-fg-muted", hideLabel && "sr-only")}>
				{label}
			</label>
			{cloneElement(children, { id })}
			{hint !== undefined && <p className="text-xs text-fg-faint">{hint}</p>}
		</div>
	);
}
