import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";

export function ComposerProperty({
	icon,
	children,
	detail,
	className,
	...props
}: ComponentProps<"button"> & { icon?: ReactNode; detail?: ReactNode }) {
	return (
		<button type="button" {...props} className={cx("composer-property", className)}>
			{icon && (
				<span aria-hidden="true" className="composer-property-icon">
					{icon}
				</span>
			)}
			<span className="truncate">{children}</span>
			{detail && <span className="composer-property-detail">{detail}</span>}
		</button>
	);
}
