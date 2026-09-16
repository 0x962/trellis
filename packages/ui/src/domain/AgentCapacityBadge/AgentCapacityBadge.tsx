import { Fire } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cx } from "../../utils/cx";

export type AgentCapacityBadgeProps = {
	used: number;
	limit: number;
	className?: string;
};

const fireDurationMs = 700;

const toneOf = (used: number, limit: number) => {
	const load = used / limit;
	if (load >= 0.8) return { name: "high", classes: "bg-danger-soft text-danger" };
	if (load >= 0.5) return { name: "medium", classes: "bg-warning-soft text-warning" };
	return { name: "low", classes: "bg-success-soft text-success" };
};

export function AgentCapacityBadge({ used, limit, className }: AgentCapacityBadgeProps) {
	const reducedMotion = useReducedMotion();
	const previous = useRef(used);
	const [showFire, setShowFire] = useState(false);
	const tone = toneOf(used, limit);

	useEffect(() => {
		const increased = used > previous.current;
		previous.current = used;
		if (!increased || reducedMotion) {
			setShowFire(false);
			return;
		}
		setShowFire(true);
		const timer = setTimeout(() => setShowFire(false), fireDurationMs);
		return () => clearTimeout(timer);
	}, [reducedMotion, used]);

	return (
		<span
			role="status"
			aria-label={`${used} of ${limit} concurrency slots in use`}
			data-load={tone.name}
			className={cx(
				"relative inline-flex h-5 shrink-0 items-center rounded-xl px-1.75 text-xs font-semibold whitespace-nowrap tabular",
				tone.classes,
				className,
			)}
		>
			{used}/{limit}
			{showFire && (
				<Fire
					data-capacity-fire=""
					aria-hidden="true"
					weight="fill"
					className="absolute -top-2 -right-2 size-3.5 text-danger transition-[opacity,scale,translate] duration-sweep ease-out starting:translate-y-1 starting:scale-75 starting:opacity-0 motion-reduce:transition-none"
				/>
			)}
		</span>
	);
}
