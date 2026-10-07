Page tabs open their actions from a right click or a touch long press. A focused tab also accepts the context-menu key and Shift+F10. The menu uses the tab that opens it. Opening the menu keeps the selected page unchanged.

The semantic tablist owns the mounted tab buttons through `aria-owns`. The shared `TabsList` supplies Base UI context to those buttons. The visual wrappers, group controls, and Close buttons stay outside the tablist's accessibility tree. Each render updates the owned IDs after virtual scroll or rename.

Left, Right, Home, and End select and focus visible tabs across both regions. These keys skip the tabs of a collapsed group. Tab reaches one tab button, the active Close action, and the strip controls. Each scroll region is a named keyboard stop when its tabs contain no selected tab. The scroll regions and tab buttons draw an inset focus outline.

Each tab width follows its title and controls, up to 60 spacing steps (240 pixels with the default theme). Longer names use an ellipsis and retain their full tooltip. The first tab starts at the strip edge. Tabs use the shared surface color and corner radius.

The layout measures titles with the strip font. The active tab and each menu or drag target stay mounted outside the viewport. The same tab positions select drag targets and the visible range. A selection uses the measured positions. The layout measures titles again after a rename, a viewport resize, or a font load.

The layout reads the shared spacing and font weight. The named `sm` breakpoint and coarse pointer variant set the control size. The tab gap uses one spacing step.

The menu shares its popup and rows with `Menu`. Its target stays mounted through dismissal and focus return. Rename and new-group actions pass focus to their fields. The group picker keeps its target separate from the selected page. A tab move stays inside its pinned region, group, or ungrouped region.

`PageTabs.actions.dom.test.tsx` and `PageTabs.access.dom.test.tsx` mount the real controls. They require the DOM test host with canvas text measurement, font events, `ResizeObserver`, `DOMRect`, and pointer events. The fixture supplies viewport geometry because a DOM host has no layout engine. Plain Bun runs skip these DOM cases. A skipped case gives no verification proof.

The release batch runs the mounted cases, the existing PageTabs tests, the Menu tests, the UI and web type checks, and scoped Biome. Browser checks cover native keyboard input, physical touch, focus, and drag behavior.
