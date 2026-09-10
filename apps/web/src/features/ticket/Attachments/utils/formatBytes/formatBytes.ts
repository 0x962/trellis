const kb = 1024;

// "2 KB", "1.5 MB": the unit that keeps the number under 1024, with one
// decimal when it is not a whole number.
export const formatBytes = (bytes: number) => {
	if (bytes < kb) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / kb;
	let unit = 0;
	while (value >= kb && unit < units.length - 1) {
		value /= kb;
		unit += 1;
	}
	const rounded = Math.round(value * 10) / 10;
	return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units[unit]}`;
};
