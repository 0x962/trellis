import { type ComponentProps, useId } from "react";
import { cx } from "../../utils/cx";

export type TextareaProps = Omit<ComponentProps<"textarea">, "id"> & {
	// The accessible name. With `hideLabel` it is read to assistive tech only.
	label: string;
	hideLabel?: boolean;
	invalid?: boolean;
};

// A multi-line text field. `rows` sets the height. The focus draws the
// accent border and a soft ring outside it, as the Input does.
export function Textarea({ label, hideLabel = false, invalid = false, className, ...props }: TextareaProps) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className={cx("text-sm text-fg-muted", hideLabel && "sr-only")}>
				{label}
			</label>
			<textarea
				id={id}
				aria-invalid={invalid || undefined}
				className={cx(
					"w-full resize-y rounded-md border bg-surface px-2.5 py-1.5 text-base leading-5 text-fg placeholder:text-fg-faint outline-none transition duration-hover ease-out",
					"focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft",
					"disabled:opacity-50",
					invalid ? "border-danger" : "border-border enabled:hover:border-border-strong",
					className,
				)}
				{...props}
			/>
		</div>
	);
}
