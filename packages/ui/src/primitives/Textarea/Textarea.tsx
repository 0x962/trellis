import { type ComponentProps, forwardRef, useId } from "react";
import { cx } from "../../utils/cx";

export type TextareaProps = Omit<ComponentProps<"textarea">, "id"> & {
	// The accessible name. With `hideLabel` it is read to assistive tech only.
	label: string;
	hideLabel?: boolean;
	invalid?: boolean;
	variant?: "default" | "composer";
	// Classes for the label and textarea wrapper.
	wrapperClassName?: string;
};

// The composer variant uses its parent for the border and focus treatment.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
	{ label, hideLabel = false, invalid = false, variant = "default", className, wrapperClassName, ...props },
	ref,
) {
	const id = useId();
	return (
		<div className={cx("flex flex-col gap-1", wrapperClassName)}>
			<label htmlFor={id} className={cx("text-sm text-fg-muted", hideLabel && "sr-only")}>
				{label}
			</label>
			<textarea
				ref={ref}
				id={id}
				aria-invalid={invalid || undefined}
				className={cx(
					"w-full rounded-md text-base leading-5 text-fg placeholder:text-fg-faint outline-none transition duration-hover ease-out",
					variant === "composer"
						? "resize-none border-0 bg-transparent py-1.5"
						: "resize-y border bg-surface px-2.5 py-1.5 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft",
					"disabled:opacity-50",
					variant === "default" && (invalid ? "border-danger" : "border-border enabled:hover:border-border-strong"),
					className,
				)}
				{...props}
			/>
		</div>
	);
});
