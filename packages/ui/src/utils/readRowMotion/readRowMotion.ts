type RowMotion = {
	duration: number;
	ease: readonly [number, number, number, number];
};

export const readRowMotion = (element: Element): RowMotion => {
	const styles = getComputedStyle(element);
	const duration = Number.parseFloat(styles.getPropertyValue("--duration-row")) / 1000;
	const ease = styles
		.getPropertyValue("--ease-out")
		.match(/-?\d*\.?\d+/g)!
		.map(Number) as [number, number, number, number];
	return { duration, ease };
};
