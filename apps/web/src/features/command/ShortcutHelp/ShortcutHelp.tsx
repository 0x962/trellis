import { Kbd, Sheet } from "@trellis/ui";
import { currentPlatform, formatShortcut, type ShortcutScope, shortcuts } from "../../../lib/shortcuts";
import { closeShortcutHelp, useShortcutHelpStore } from "./shortcutHelpStore";

// The name each scope carries on the sheet.
const scopeNames: Record<ShortcutScope, string> = {
	global: "Global",
	list: "List",
	board: "Board",
	peek: "Peek",
	ticket: "Ticket",
	composer: "Composer",
};

// The scopes that hold a row, in map order.
const scopesInOrder = (): ShortcutScope[] => [...new Set(shortcuts.map((shortcut) => shortcut.scope))];

// Every row of the shortcut map, grouped by scope. The sheet reads the
// map, so a key that exists is a key the sheet shows.
export function ShortcutHelp() {
	const open = useShortcutHelpStore((state) => state.open);
	const platform = currentPlatform();
	return (
		<Sheet open={open} onOpenChange={closeShortcutHelp} title="Keyboard shortcuts" width={520}>
			<div className="flex flex-col gap-5 px-4 py-4">
				{scopesInOrder().map((scope) => (
					<section key={scope} aria-label={scopeNames[scope]} className="flex flex-col gap-1">
						<h3 className="h-6 text-sm text-fg-faint">{scopeNames[scope]}</h3>
						<ul className="flex flex-col">
							{shortcuts
								.filter((shortcut) => shortcut.scope === scope)
								.map((shortcut) => (
									<li key={shortcut.id} className="flex h-8 items-center gap-3 text-base text-fg">
										<span className="min-w-0 flex-1 truncate">{shortcut.label}</span>
										<span className="flex shrink-0 items-center gap-1">
											{formatShortcut(shortcut.keys, platform).map((cap) => (
												<Kbd key={cap}>{cap}</Kbd>
											))}
										</span>
									</li>
								))}
						</ul>
					</section>
				))}
			</div>
		</Sheet>
	);
}
