import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type WorkingAgentTextProps = ComponentPropsWithoutRef<"span"> & {
	count?: number;
	tooltip?: boolean;
	children: ReactNode;
};

export const workingAgentsLabel = (count: number) => `${count} ${count === 1 ? "agent" : "agents"} working`;

export function WorkingAgentText({ count = 1, tooltip = true, className, children, ...props }: WorkingAgentTextProps) {
	const text = (
		<span {...props} className={cx("text-film", className)}>
			{children}
		</span>
	);
	return tooltip ? <Tooltip content={workingAgentsLabel(count)}>{text}</Tooltip> : text;
}
