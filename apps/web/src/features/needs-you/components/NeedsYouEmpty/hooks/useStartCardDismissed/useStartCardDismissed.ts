import { useState } from "react";

// The browser remembers a dismissed start card, so it never comes back on
// this browser. Another browser still shows it.
const storageKey = "trellis.needs-you.start-dismissed";

export const useStartCardDismissed = () => {
	const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "1");
	const dismiss = () => {
		localStorage.setItem(storageKey, "1");
		setDismissed(true);
	};
	return [dismissed, dismiss] as const;
};
