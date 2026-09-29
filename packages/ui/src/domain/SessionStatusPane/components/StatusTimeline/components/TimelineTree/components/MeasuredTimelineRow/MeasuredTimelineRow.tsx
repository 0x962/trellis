import { type ReactNode, useLayoutEffect, useRef } from "react";

type Props = { measureKey: string; measure: (key: string, height: number) => void; children: ReactNode };

export function MeasuredTimelineRow({ measureKey, measure, children }: Props) {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const element = ref.current!;
		const read = () => measure(measureKey, element.getBoundingClientRect().height);
		read();
		const observer = new ResizeObserver(read);
		observer.observe(element);
		return () => observer.disconnect();
	}, [measureKey, measure]);
	return <div ref={ref}>{children}</div>;
}
