import { lazy, Suspense } from "react";

const CommandPalette = lazy(() =>
	import("../../command/CommandPalette").then((module) => ({ default: module.CommandPalette })),
);
const ComposerHost = lazy(() =>
	import("../../composer/ComposerHost").then((module) => ({ default: module.ComposerHost })),
);
const PageSheetHost = lazy(() => import("../PageSheetHost").then((module) => ({ default: module.PageSheetHost })));
const BroadcastHost = lazy(() =>
	import("../../agents/BroadcastDialog").then((module) => ({ default: module.BroadcastHost })),
);

export function ShellOverlays() {
	return (
		<Suspense fallback={null}>
			<BroadcastHost />
			<CommandPalette />
			<ComposerHost />
			<PageSheetHost />
		</Suspense>
	);
}
