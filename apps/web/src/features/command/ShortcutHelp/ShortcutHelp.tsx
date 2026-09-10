import { lazy, Suspense, useEffect, useState } from "react";
import { preloadOnIdle } from "../../../lib/preloadOnIdle";
import { useShortcutHelpStore } from "./shortcutHelpStore";

// The sheet body is a lazy chunk, so the entry chunk carries only this host.
const loadShortcutSheet = () => import("./components/ShortcutSheet");
const ShortcutSheet = lazy(() => loadShortcutSheet().then((module) => ({ default: module.ShortcutSheet })));

// The keyboard shortcut sheet. The sheet mounts on the first open and stays
// mounted, so each close runs its exit transition. Its chunk loads when the
// browser is idle, so the first `?` does not wait on the network.
export function ShortcutHelp() {
	const open = useShortcutHelpStore((state) => state.open);
	const [mounted, setMounted] = useState(open);
	if (open && !mounted) setMounted(true);

	useEffect(() => preloadOnIdle(loadShortcutSheet), []);

	if (!mounted) return null;
	return (
		<Suspense fallback={null}>
			<ShortcutSheet open={open} />
		</Suspense>
	);
}
