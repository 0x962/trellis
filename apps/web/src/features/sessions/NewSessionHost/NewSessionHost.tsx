import { lazy, Suspense } from "react";
import { sessionComposerActions, useSessionComposerStore } from "../sessionComposerStore";

// The dialog is a lazy chunk: the shell pays for it on the first open.
const NewSessionDialog = lazy(() =>
	import("../NewSessionDialog/NewSessionDialog").then((module) => ({ default: module.NewSessionDialog })),
);

// Mounts the New session dialog while the store says it is open. The root
// shell renders it once, above every page and outside the phone sheet.
export function NewSessionHost() {
	const open = useSessionComposerStore((state) => state.open);
	if (!open) return null;
	return (
		<Suspense fallback={null}>
			<NewSessionDialog onClose={sessionComposerActions.close} />
		</Suspense>
	);
}
