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

// A single-line text field, 28 px tall.
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
					"h-7 w-full rounded-md border bg-surface px-2 text-base text-fg placeholder:text-fg-faint transition duration-hover ease-out",
					"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
					"disabled:opacity-50 disabled:pointer-events-none",
					invalid ? "border-danger" : "border-border hover:border-border-strong",
					className,
				)}
				{...props}
			/>
		</div>
	);
}
