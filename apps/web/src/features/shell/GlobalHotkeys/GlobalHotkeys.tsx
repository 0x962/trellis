import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { useGlobalHotkeys } from "../../../lib/hotkeys";
import { commandActions } from "../../command/commandStore";
import { SequenceHint } from "../../command/SequenceHint";
import { openShortcutHelp } from "../../command/ShortcutHelp";
import { routeDefaults } from "../../command/utils/routeDefaults";
import { composerActions } from "../../composer";

// The shell's keyboard. It binds every global row of the shortcut map and
// draws the hint of a pending `g` sequence. The two bare pages, the first
// run and the gallery, mount no shell and take no key.
export function GlobalHotkeys() {
	const router = useRouter();
	const { scheduler } = useApp();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });

	const navigate = useCallback((href: string) => void router.navigate({ href }), [router]);
	const onCompose = useCallback(() => composerActions.open(routeDefaults(pathname, search)), [pathname, search]);
	const onPalette = useCallback(() => commandActions.toggle("commands"), []);
	const onSearch = useCallback(() => commandActions.toggle("search"), []);
	const onProjectPicker = useCallback(() => commandActions.open("projects"), []);

	// The ticket context and the selection belong to one route.
	useEffect(() => commandActions.setRoute(pathname), [pathname]);

	const pending = useGlobalHotkeys({
		navigate,
		pathname,
		onPalette,
		onSearch,
		onCompose,
		onHelp: openShortcutHelp,
		onProjectPicker,
		scheduler,
	});

	return <SequenceHint pending={pending} />;
}
