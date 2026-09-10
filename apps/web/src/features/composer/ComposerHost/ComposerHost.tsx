import { useRouterState } from "@tanstack/react-router";
import { toast } from "@trellis/ui";
import { lazy, Suspense, useEffect } from "react";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { projectRefOfPathname } from "../../../lib/projectPath";
import { composerActions, useComposerStore } from "../composerStore";

// The dialog is a lazy chunk: the shell pays for it on the first open.
const CreateTicketDialog = lazy(() =>
	import("../CreateTicketDialog/CreateTicketDialog").then((module) => ({ default: module.CreateTicketDialog })),
);

// Mounts the composer while the store says it is open. The root shell
// renders it once, so every page can open it. An archived project takes no
// new ticket, so an open that targets one closes at once with a toast.
export function ComposerHost() {
	const open = useComposerStore((state) => state.open);
	const project = useComposerStore((state) => state.options.project);
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const { isArchived, notice } = useArchivedProjects();
	const target = project ?? projectRefOfPathname(pathname) ?? undefined;
	const refused = open && target !== undefined && isArchived(target);

	useEffect(() => {
		if (!refused) return;
		toast.error(notice(target!));
		composerActions.close();
	}, [refused, target, notice]);

	if (!open || refused) return null;
	return (
		<Suspense fallback={null}>
			<CreateTicketDialog />
		</Suspense>
	);
}
