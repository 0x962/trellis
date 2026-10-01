import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

export function useStoryState<T>(initial: T): [T, Dispatch<SetStateAction<T>>] {
	const [value, setValue] = useState(() => initial);
	useEffect(() => setValue(() => initial), [initial]);
	return [value, setValue];
}
