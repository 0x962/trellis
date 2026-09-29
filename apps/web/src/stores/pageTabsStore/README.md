The page tab store saves open tabs, their order, the selected tab, and closed tabs under the current host origin. Each tab retains its identity, current page, back history, and forward history.

`moveTab(id, beforeId)` places a tab before another tab. A null `beforeId` places it at the end. `renameTab(id, title)` saves a custom name separately from the automatic page title. Null or blank text restores the automatic title.

`sortTabs(direction)` orders the tabs by their visible names, ascending or descending. The visible name is the custom name when one exists, else the page title. Tabs with equal names keep their relative order. `pageTabRegion(tab)` names the region of a tab; a sort reorders tabs inside each contiguous region and keeps the regions in place. The selected tab, every tab ID, page, history, and custom name stay unchanged.

`selectAdjacentTab(offset)` selects the next tab for 1 or the previous tab for -1. It wraps at either end of the current order and saves the selected tab.

`closeTab(id)` saves the complete tab and its position on a stack. `reopenClosedTab()` restores the last closed tab and selects it. The stack has no count limit. If the last tab closes, the store creates a home tab. Reopen removes that replacement only while it retains its original page, empty history, and automatic name.

The command palette and the desktop menu use the commands that PageTabsHost handles. The desktop preload receives tab commands through a dedicated IPC channel. The desktop menu owns the tab shortcuts even when an editor or terminal has focus. The explicit Close window command uses Command/Ctrl+Shift+W. A browser keeps its own tab shortcuts.
