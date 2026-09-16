import { lazy, Suspense } from "react";

const CommandPalette = lazy(() =>
	import("../../command/CommandPalette").then((module) => ({ default: module.CommandPalette })),
);
const ComposerHost = lazy(() =>
	import("../../composer/ComposerHost").then((module) => ({ default: module.ComposerHost })),
);

export function GlobalSurfaces() {
	return (
		<Suspense fallback={null}>
			<CommandPalette />
			<ComposerHost />
		</Suspense>
	);
}
