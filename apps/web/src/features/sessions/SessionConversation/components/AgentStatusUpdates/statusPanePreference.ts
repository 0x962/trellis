import { useState } from "react";

export const sessionStatusPaneStorageKey = "trellis-session-status-pane";

export const sessionStatusPaneVisible = (storage: Pick<Storage, "getItem"> | undefined) =>
	storage?.getItem(sessionStatusPaneStorageKey) !== "hidden";

export const saveSessionStatusPaneVisible = (storage: Pick<Storage, "setItem"> | undefined, visible: boolean) =>
	storage?.setItem(sessionStatusPaneStorageKey, visible ? "shown" : "hidden");

export function useSessionStatusPaneVisibility() {
	const [visible, setVisible] = useState(() => sessionStatusPaneVisible(globalThis.localStorage));
	const toggle = () =>
		setVisible((current) => {
			const next = !current;
			saveSessionStatusPaneVisible(globalThis.localStorage, next);
			return next;
		});
	return { visible, toggle };
}
