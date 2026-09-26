import { useRef, useState, useSyncExternalStore } from "react";
import { settingsSave } from "./settingsSave";

export function useSettingsSave<T extends object>({
	initialValue,
	save,
}: {
	initialValue: T;
	save: (patch: Partial<T>) => Promise<void>;
}) {
	const saveRef = useRef(save);
	saveRef.current = save;
	const [store] = useState(() => settingsSave(initialValue, (patch) => saveRef.current(patch)));
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	return { ...snapshot, setField: store.setField, saveField: store.saveField };
}
