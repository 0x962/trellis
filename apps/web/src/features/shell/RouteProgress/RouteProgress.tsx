import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";

// How long a navigation loads before the bar shows. A fast page never
// flashes it.
export const routeProgressDelayMs = 150;

// A 2 px accent bar across the top of the main pane while a navigation
// loads for more than 150 ms. The old page stays on screen under it.
export function RouteProgress() {
	const { scheduler } = useApp();
	const loading = useRouterState({ select: (state) => state.isLoading && state.resolvedLocation !== undefined });
	const [show, setShow] = useState(false);

	useEffect(() => {
		if (!loading) {
			setShow(false);
			return;
		}
		const handle = scheduler.setTimeout(() => setShow(true), routeProgressDelayMs);
		return () => scheduler.clearTimeout(handle);
	}, [loading, scheduler]);

	if (!show) return null;
	return (
		<div
			role="progressbar"
			aria-label="Loading the page"
			className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-accent"
		/>
	);
}
