import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { backNavigation } from "../../../lib/backNavigation";
import { useGlobalHotkeys } from "../../../lib/hotkeys";
import { commandActions } from "../../command/commandStore";
import { SequenceHint } from "../../command/SequenceHint";

// The shell binds navigation and command shortcuts and shows pending `g` sequences.
export function GlobalHotkeys() {
	const router = useRouter();
	const { scheduler } = useApp();
	const pathname = useRouterState({ select: (state) => state.location.pathname });

	const navigate = useCallback((href: string) => void router.navigate({ href }), [router]);
	const onPalette = useCallback(() => commandActions.toggle("commands"), []);
	const onSearch = useCallback(() => commandActions.toggle("search"), []);
	const onProjectPicker = useCallback(() => commandActions.open("projects"), []);
	const onBack = useCallback(() => void backNavigation(router), [router]);
	const onForward = useCallback(() => router.history.forward(), [router]);

	// The ticket context and the selection belong to one route.
	useEffect(() => commandActions.setRoute(pathname), [pathname]);

	const pending = useGlobalHotkeys({
		navigate,
		pathname,
		onPalette,
		onSearch,
		onProjectPicker,
		onBack,
		onForward,
		scheduler,
	});

	return <SequenceHint pending={pending} />;
}
