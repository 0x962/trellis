import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "../../utils/cx";

export function ComposerProperty({
	icon,
	children,
	detail,
	className,
	glimmer = false,
	glimmerValue,
	...props
}: ComponentProps<"button"> & {
	icon?: ReactNode;
	detail?: ReactNode;
	glimmer?: boolean;
	glimmerValue?: string;
}) {
	const previous = useRef(glimmerValue);
	const [active, setActive] = useState<string>();
	useEffect(() => {
		const changed = previous.current !== glimmerValue;
		previous.current = glimmerValue;
		setActive(glimmer && changed ? glimmerValue : undefined);
	}, [glimmer, glimmerValue]);
	return (
		<button type="button" {...props} className={cx("composer-property", className)}>
			{icon && (
				<span aria-hidden="true" className="composer-property-icon">
					{icon}
				</span>
			)}
			<span
				key={glimmerValue}
				className={cx(
					"truncate",
					glimmer && active !== undefined && active === glimmerValue && "text-film [animation-iteration-count:1]",
				)}
				onAnimationEnd={() => setActive(undefined)}
			>
				{children}
			</span>
			{detail && <span className="composer-property-detail">{detail}</span>}
		</button>
	);
}
