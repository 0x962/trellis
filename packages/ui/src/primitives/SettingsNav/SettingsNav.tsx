export type SettingsNavItem = {
	// The value the caller holds for this item. The app settings use the
	// section id of the URL, and the project settings use the empty string
	// for their first section.
	id: string;
	label: string;
};

export type SettingsNavProps = {
	// The accessible name of the nav, and the text a screen reader reads
	// above the list.
	label: string;
	items: readonly SettingsNavItem[];
	selected: string;
	onSelect: (id: string) => void;
};

// The list of sections on the left of a settings screen. The settings of
// the app and the settings of a project both draw it, and each one holds
// the selected section itself, because a settings screen in a sheet has no
// URL of its own.
export function SettingsNav({ label, items, selected, onSelect }: SettingsNavProps) {
	return (
		<nav aria-label={label} className="project-settings-nav">
			<p className="project-settings-nav-title">{label}</p>
			<ul className="project-settings-nav-list">
				{items.map((item) => (
					<li key={item.id}>
						<button
							type="button"
							aria-current={selected === item.id ? "page" : undefined}
							className="project-settings-nav-link"
							onClick={() => onSelect(item.id)}
						>
							{item.label}
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}
