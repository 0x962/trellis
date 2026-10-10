import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import { Field, type FieldOptions } from "../Field";

export type InputProps = Omit<ComponentProps<typeof BaseInput>, "id" | "className"> &
	FieldOptions & {
		className?: string;
	};

// The neutral focus border uses fg-faint so it stays distinct from
// the surface in both themes. The caret marks the insertion point.
export function Input({
	label,
	hideLabel = false,
	hint,
	error,
	readOnly,
	readOnlyReason,
	trailingAction,
	disabled,
	className,
	...props
}: InputProps) {
	return (
		<Field
			label={label}
			hideLabel={hideLabel}
			hint={hint}
			error={error}
			readOnly={readOnly}
			readOnlyReason={readOnlyReason}
			trailingAction={trailingAction}
			disabled={disabled}
		>
			<BaseInput
				className={cx(
					"h-8 pointer-coarse:h-11 w-full rounded-md border bg-surface px-2.5 text-sm text-fg placeholder:text-fg-faint outline-none transition duration-hover ease-out",
					"focus-visible:border-fg-faint focus-visible:ring-3 focus-visible:ring-accent-soft",
					"disabled:opacity-50 read-only:bg-bg aria-invalid:border-danger aria-invalid:focus-visible:border-danger",
					// A field that holds a refused value often has the focus, because
					// the screen puts it back there. Without this rule the focus
					// border replaces the danger border at that moment, and the
					// person sees no sign of the refusal.
					error !== undefined
						? "border-danger focus-visible:border-danger"
						: "border-border enabled:hover:border-border-strong",
					className,
				)}
				{...props}
			/>
		</Field>
	);
}
