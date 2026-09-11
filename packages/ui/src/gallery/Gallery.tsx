import { type ThemeMode, useTheme } from "../hooks/useTheme";
import { Segmented } from "../primitives/Segmented";
import { CompositionSection } from "./components/CompositionSection";
import { ControlSections } from "./components/ControlSections";
import { DisplaySections } from "./components/DisplaySections";
import { DomainSections } from "./components/DomainSections";
import { OverlaySections } from "./components/OverlaySections";

const themes: { value: ThemeMode; label: string }[] = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

// Every primitive in every state, every domain component in every variant,
// and the product rows built from them. The theme switch stamps <html>, so
// the whole page flips at once.
export function Gallery() {
	const { mode, setTheme } = useTheme();
	return (
		<div className="min-h-screen bg-bg text-base text-fg">
			<header className="sticky top-0 z-10 flex h-11 items-center gap-3 border-b border-border bg-surface px-5">
				<span className="font-mono text-md font-medium">trellis</span>
				<span className="text-sm text-fg-muted">gallery</span>
				<div className="ml-auto">
					<Segmented label="Theme" options={themes} value={mode} onValueChange={setTheme} />
				</div>
			</header>
			<main className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-8">
				<ControlSections />
				<OverlaySections />
				<DisplaySections />
				<DomainSections />
				<CompositionSection />
			</main>
		</div>
	);
}
