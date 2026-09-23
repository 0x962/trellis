import { cloneElement, type ReactElement, type ReactNode, useId } from "react";

export type FieldProps = {
	// The visible label. A click on it reaches the control.
	label: string;
	// One line under the control that says what the value does.
	hint?: ReactNode;
	// The control. It takes the id of the label through its `id` prop.
	children: ReactElement<{ id?: string }>;
};

// The label, the control and the hint of one form field, with the spacing
// `Input` uses. `Input` and `Textarea` draw their own label, so this wraps a
// control that draws none, such as `Select`.
export function Field({ label, hint, children }: FieldProps) {
	const id = useId();
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<label htmlFor={id} className="text-sm text-fg-muted">
				{label}
			</label>
			{cloneElement(children, { id })}
			{hint !== undefined && <p className="text-xs text-fg-faint">{hint}</p>}
		</div>
	);
}
