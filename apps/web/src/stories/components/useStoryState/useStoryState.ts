import { type Dispatch, type SetStateAction, useState } from "react";

export function useStoryState<T>(initial: T): [T, Dispatch<SetStateAction<T>>] {
	const [previous, setPrevious] = useState(() => initial);
	const [value, setValue] = useState(() => initial);
	if (!Object.is(previous, initial)) {
		setPrevious(() => initial);
		setValue(() => initial);
	}
	return [value, setValue];
}
