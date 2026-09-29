import { type ReactNode, useLayoutEffect, useRef } from "react";

export function MeasuredRunRow({
	rowKey,
	top,
	onMeasure,
	children,
}: {
	rowKey: string;
	top: number;
	onMeasure: (key: string, height: number) => void;
	children: ReactNode;
}) {
	const element = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const update = () => onMeasure(rowKey, element.current!.getBoundingClientRect().height);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element.current!);
		return () => observer.disconnect();
	}, [rowKey, onMeasure]);
	return (
		<div
			ref={element}
			role="presentation"
			className="absolute inset-x-0 top-0"
			style={{ transform: `translateY(${top}px)` }}
		>
			{children}
		</div>
	);
}
