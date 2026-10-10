import { useRouterState } from "@tanstack/react-router";
import { toast } from "@trellis/ui";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { projectRefOfPathname } from "../../../lib/projectUrl";
import { composerActions, useComposerStore } from "../composerStore";

// The dialog is a lazy chunk: the shell pays for it on the first open.
const CreateTicketDialog = lazy(() =>
	import("../CreateTicketDialog/CreateTicketDialog").then((module) => ({ default: module.CreateTicketDialog })),
);

// The mounted composer retains selected files and requests while its dialog is closed.
export function ComposerHost() {
	const open = useComposerStore((state) => state.open);
	const [mounted, setMounted] = useState(open);
	if (open && !mounted) setMounted(true);
	const project = useComposerStore((state) => state.options.project);
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const previousPathname = useRef(pathname);
	useEffect(() => {
		if (previousPathname.current !== pathname) composerActions.clearOnCreated();
		previousPathname.current = pathname;
	}, [pathname]);
	useEffect(() => () => composerActions.clearOnCreated(), []);
	const { isArchived, notice } = useArchivedProjects();
	const target = project ?? projectRefOfPathname(pathname) ?? undefined;
	const refused = open && target !== undefined && isArchived(target);

	useEffect(() => {
		if (!refused) return;
		toast.error(notice(target!));
		composerActions.close();
	}, [refused, target, notice]);

	if (!mounted) return null;
	return (
		<Suspense fallback={null}>
			<CreateTicketDialog open={open && !refused} />
		</Suspense>
	);
}
