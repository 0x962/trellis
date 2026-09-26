import { cloneElement, type ReactElement, type ReactNode, useContext, useId } from "react";
import { cx } from "../../utils/cx";
import { FieldHint } from "../FieldHint";
import { FieldContext, type FieldControlProps } from "./fieldContext";

export type FieldOptions = {
	label: string;
	hideLabel?: boolean;
	hint?: ReactNode;
	disabled?: boolean;
	error?: string;
	readOnly?: boolean;
	readOnlyReason?: string;
	trailingAction?: ReactNode;
};

export type FieldProps = FieldOptions & {
	id?: string;
	children: ReactElement<FieldControlProps>;
	className?: string;
};

export function Field({
	id,
	label,
	hideLabel = false,
	hint,
	disabled,
	error,
	readOnly,
	readOnlyReason,
	trailingAction,
	children,
	className,
}: FieldProps) {
	const generatedId = useId();
	const outerControlProps = useContext(FieldContext);
	const controlId = id ?? children.props.id ?? generatedId;
	const message = error ?? (readOnly ? (readOnlyReason ?? hint) : hint);
	const hasMessage = message !== undefined && message !== null;
	const controlProps: FieldControlProps = outerControlProps ?? {
		id: controlId,
		"aria-labelledby":
			children.props["aria-labelledby"] ?? (children.props["aria-label"] ? undefined : `${controlId}-label`),
		"aria-describedby":
			[children.props["aria-describedby"], hasMessage ? `${controlId}-hint` : undefined].filter(Boolean).join(" ") ||
			undefined,
		"aria-invalid": error !== undefined || children.props["aria-invalid"] || undefined,
		...(disabled === undefined ? {} : { disabled }),
		...(readOnly === undefined ? {} : { readOnly }),
	};
	const control = cloneElement(children, controlProps);
	if (outerControlProps) return control;
	return (
		<div className={cx("flex min-w-0 flex-col gap-1", className)}>
			<label
				id={`${controlId}-label`}
				htmlFor={controlId}
				className={cx("text-sm text-fg-muted", hideLabel && "sr-only")}
			>
				{label}
			</label>
			<div className="flex min-w-0 items-center gap-2">
				<div className="min-w-0 flex-1">
					<FieldContext.Provider value={controlProps}>{control}</FieldContext.Provider>
				</div>
				{trailingAction}
			</div>
			{hasMessage && (
				<FieldHint
					id={`${controlId}-hint`}
					role={error !== undefined ? "alert" : undefined}
					tone={error !== undefined ? "danger" : "default"}
				>
					{message}
				</FieldHint>
			)}
		</div>
	);
}
