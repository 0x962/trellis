import { lazy, Suspense } from "react";

const CommandPalette = lazy(() =>
	import("../../command/CommandPalette").then((module) => ({ default: module.CommandPalette })),
);
const ComposerHost = lazy(() =>
	import("../../composer/ComposerHost").then((module) => ({ default: module.ComposerHost })),
);
const PageSheetHost = lazy(() => import("../PageSheetHost").then((module) => ({ default: module.PageSheetHost })));

export function ShellOverlays() {
	return (
		<Suspense fallback={null}>
			<CommandPalette />
			<ComposerHost />
			<PageSheetHost />
		</Suspense>
	);
}
