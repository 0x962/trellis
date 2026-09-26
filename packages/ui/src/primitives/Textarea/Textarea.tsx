import { type ComponentProps, forwardRef } from "react";
import { cx } from "../../utils/cx";
import { Field, type FieldOptions } from "../Field";

export type TextareaProps = Omit<ComponentProps<"textarea">, "id"> &
	FieldOptions & {
		variant?: "default" | "composer";
		wrapperClassName?: string;
	};

// The composer variant uses its parent for the border and focus treatment.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
	{
		label,
		hideLabel = false,
		variant = "default",
		hint,
		error,
		readOnly,
		readOnlyReason,
		trailingAction,
		disabled,
		className,
		wrapperClassName,
		...props
	},
	ref,
) {
	return (
		<Field
			className={wrapperClassName}
			label={label}
			hideLabel={hideLabel}
			hint={hint}
			error={error}
			readOnly={readOnly}
			readOnlyReason={readOnlyReason}
			trailingAction={trailingAction}
			disabled={disabled}
		>
			<textarea
				ref={ref}
				className={cx(
					"w-full rounded-md text-sm leading-5 text-fg placeholder:text-fg-faint outline-none transition duration-hover ease-out",
					variant === "composer"
						? "resize-none border-0 bg-transparent py-1.5"
						: "resize-y border bg-surface px-2.5 py-1.5 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft",
					"disabled:opacity-50 read-only:bg-bg aria-invalid:border-danger aria-invalid:focus-visible:border-danger",
					variant === "default" &&
						(error !== undefined ? "border-danger" : "border-border enabled:hover:border-border-strong"),
					className,
				)}
				{...props}
			/>
		</Field>
	);
});
