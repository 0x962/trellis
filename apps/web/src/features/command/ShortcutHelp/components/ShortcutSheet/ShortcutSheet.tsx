import { Input, Kbd, Sheet } from "@trellis/ui";
import { Fragment, useRef, useState } from "react";
import {
	currentPlatform,
	formatShortcut,
	type Shortcut,
	type ShortcutScope,
	shortcuts,
} from "../../../../../lib/shortcuts";
import { closeShortcutHelp } from "../../shortcutHelpStore";

export type ShortcutSheetProps = {
	open: boolean;
};

// The name each scope carries on the sheet.
const scopeNames: Record<ShortcutScope, string> = {
	global: "Global",
	list: "List",
	board: "Board",
	peek: "Peek",
	ticket: "Ticket",
	composer: "New ticket",
};

type Action = { scope: ShortcutScope; label: string; bindings: Shortcut[] };

// One action per scope and label, in map order, with every row of the map
// that runs it.
const actions = (): Action[] => {
	const found = new Map<string, Action>();
	for (const shortcut of shortcuts) {
		const key = `${shortcut.scope} ${shortcut.label}`;
		const action = found.get(key) ?? { scope: shortcut.scope, label: shortcut.label, bindings: [] };
		action.bindings.push(shortcut);
		found.set(key, action);
	}
	return [...found.values()];
};

// An action answers the typed text through its label or a shortcut id, so
// "theme" finds "Switch between dark and light".
const matches = (action: Action, typed: string) => {
	const needle = typed.trim().toLowerCase();
	if (needle === "") return true;
	return [action.label, ...action.bindings.map((binding) => binding.id)].some((text) =>
		text.toLowerCase().includes(needle),
	);
};

// Every row of the shortcut map, grouped by scope in map order. The sheet
// reads the map, so a key that exists is a key the sheet shows. The search
// field takes the first focus, so a mouse open draws no focus ring on the
// close button.
export function ShortcutSheet({ open }: ShortcutSheetProps) {
	const platform = currentPlatform();
	const [query, setQuery] = useState("");
	const field = useRef<HTMLInputElement>(null);
	const shown = actions().filter((action) => matches(action, query));
	const scopes = [...new Set(shown.map((action) => action.scope))];
	return (
		<Sheet
			open={open}
			onOpenChange={closeShortcutHelp}
			title="Keyboard shortcuts"
			titleClassName="text-md font-semibold text-fg"
			width={400}
			initialFocus={field}
		>
			<div className="flex flex-col gap-4 px-4 py-3">
				<Input
					ref={field}
					type="search"
					label="Search the shortcuts"
					hideLabel
					placeholder="Search the shortcuts"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				{scopes.map((scope) => (
					<section key={scope} aria-label={scopeNames[scope]} className="flex flex-col">
						<h3 className="flex h-7 items-center text-xs font-medium tracking-[0.04em] text-fg-faint uppercase">
							{scopeNames[scope]}
						</h3>
						<ul className="flex flex-col">
							{shown
								.filter((action) => action.scope === scope)
								.map((action) => (
									<li
										key={action.label}
										aria-label={action.label}
										data-action={`${action.scope} ${action.label}`}
										className="flex h-8 items-center gap-3 text-base text-fg"
									>
										<span className="min-w-0 flex-1 truncate">{action.label}</span>
										<span className="flex shrink-0 items-center gap-1">
											{action.bindings.map((binding, index) => (
												<Fragment key={binding.id}>
													{index > 0 && <span className="px-0.5 text-xs text-fg-faint">or</span>}
													{formatShortcut(binding.keys, platform).map((cap) => (
														<Kbd key={cap}>{cap}</Kbd>
													))}
												</Fragment>
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
