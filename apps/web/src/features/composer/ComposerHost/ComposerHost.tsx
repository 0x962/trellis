import { lazy, Suspense } from "react";
import { useComposerStore } from "../composerStore";

// The dialog is a lazy chunk: the shell pays for it on the first open.
const CreateTicketDialog = lazy(() =>
	import("../CreateTicketDialog/CreateTicketDialog").then((module) => ({ default: module.CreateTicketDialog })),
);

// Mounts the composer while the store says it is open. The root shell
// renders it once, so every page can open it.
export function ComposerHost() {
	const open = useComposerStore((state) => state.open);
	if (!open) return null;
	return (
		<Suspense fallback={null}>
			<CreateTicketDialog />
		</Suspense>
	);
}
