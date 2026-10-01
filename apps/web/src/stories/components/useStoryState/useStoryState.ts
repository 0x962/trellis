import { type Dispatch, type SetStateAction, useLayoutEffect, useState } from "react";

export function useStoryState<T>(initial: T): [T, Dispatch<SetStateAction<T>>] {
	const [value, setValue] = useState(() => initial);
	useLayoutEffect(() => setValue(() => initial), [initial]);
	return [value, setValue];
}
