import { useEffect, useState } from "react";

// The wait between the last keystroke and the request, in ms.
export const debounceMs = 120;

// The value after it stops changing for `debounceMs`. An empty value comes
// back at once, so the recent searches return without a wait.
export const useDebouncedValue = (value: string): string => {
	const [settled, setSettled] = useState(value);
	useEffect(() => {
		if (value === "") {
			setSettled("");
			return;
		}
		const timer = setTimeout(() => setSettled(value), debounceMs);
		return () => clearTimeout(timer);
	}, [value]);
	return value === "" ? "" : settled;
};
