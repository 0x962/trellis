// The wait between the last keystroke and the request, in ms.
export const debounceMs = 120;

// The value after it stops changing for `debounceMs`. An empty value comes
// back at once, so the recent searches return without a wait.
export const useDebouncedValue = (_value: string): string => {
	throw new Error("useDebouncedValue is not built yet.");
};
