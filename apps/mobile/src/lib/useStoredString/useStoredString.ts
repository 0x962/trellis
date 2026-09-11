import { useCallback, useEffect, useState } from "react";
import { store } from "../store";

// The value of one key of the app store, and a function that writes it.
// `undefined` is a key the store holds nothing for, and a write of
// `undefined` takes the value back out. The hook re-reads its key after every
// change to that key, so two mounted screens on one key paint one value.
export const useStoredString = (key: string) => {
	const [value, setValue] = useState(() => store.getString(key));

	useEffect(() => {
		setValue(store.getString(key));
		const listener = store.addOnValueChangedListener((changed) => {
			if (changed === key) setValue(store.getString(key));
		});
		return () => listener.remove();
	}, [key]);

	const set = useCallback(
		(next: string | undefined) => {
			if (next === undefined) store.remove(key);
			else store.set(key, next);
		},
		[key],
	);

	return [value, set] as const;
};
