import { Input as BaseInput } from "@base-ui/react/input";
import { type ComponentProps, useId } from "react";
import { cx } from "../../utils/cx";

export type InputProps = Omit<ComponentProps<typeof BaseInput>, "id" | "className"> & {
	className?: string;
	// The accessible name. With `hideLabel` it is read to assistive tech only.
	label: string;
	hideLabel?: boolean;
	invalid?: boolean;
};

// A single-line text field, 32 px tall. The focus draws the accent border
// and a soft ring outside it; the caret shows where the text goes.
export function Input({ label, hideLabel = false, invalid = false, className, ...props }: InputProps) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className={cx("text-sm text-fg-muted", hideLabel && "sr-only")}>
				{label}
			</label>
			<BaseInput
				id={id}
				aria-invalid={invalid || undefined}
				className={cx(
					"h-8 w-full rounded-md border bg-surface px-2.5 text-base text-fg placeholder:text-fg-faint outline-none transition duration-hover ease-out",
					"focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft",
					"disabled:opacity-50",
					// A field that holds a value the server refused keeps the red
					// border while it has the focus, or the refusal is invisible to
					// a person whose focus the field took back.
					invalid ? "border-danger focus-visible:border-danger" : "border-border enabled:hover:border-border-strong",
					className,
				)}
				{...props}
			/>
		</div>
	);
}
