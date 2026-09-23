# UI patterns

Trellis uses one set of UI elements across its boards, tables, and inbox.
`packages/ui` owns the visuals. Web feature components connect those visuals to data and navigation.

## Reuse before design

1. Find the matching board or table interaction before you change a page.
2. Reuse its canonical component, tokens, and keyboard behavior.
3. Put shared visuals in `packages/ui` when you extract an existing pattern.
4. Check the affected pages after a change to a shared component.

Before adding a new UI element or interaction pattern, explain why the canonical elements do not cover the need.
Show the existing options and ask the user for advice. Wait for the answer before implementation.
Each page supplies its data and available actions. It does not choose new control shapes, spacing, icons, or menu behavior.

## Canonical elements

| Need | Canonical component | Reference |
| --- | --- | --- |
| Page title and actions | `Topbar`, `PageTitle` | `apps/web/src/features/shell/Topbar/Topbar.tsx` |
| A page over the current page | `PageSheet` | `apps/web/src/features/shell/PageSheet/PageSheet.tsx` |
| The ticket sheet and the review sheet over it | `PageSheetHost`, `pageSheetActions` | `apps/web/src/features/shell/PageSheetHost/PageSheetHost.tsx` |
| A web page inside the app | `BrowserSheet`, `openLink` | `apps/web/src/features/shell/PageSheetHost/components/BrowserSheet/BrowserSheet.tsx` |
| The name of a ticket in a list | `TicketLink` | `apps/web/src/features/shell/TicketLink/TicketLink.tsx` |
| Filter chips and controls | `FilterBar`, `Chip` | `packages/ui/src/domain/FilterBar/FilterBar.tsx` |
| Searchable filter choices | `FilterPopover`, `Command` | `packages/ui/src/domain/FilterPopover/FilterPopover.tsx` |
| Searchable model choices | `ModelPicker` | `apps/web/src/features/agents/ModelPicker/ModelPicker.tsx` |
| Sort field and direction | `DisplayPopover` | `packages/ui/src/domain/DisplayPopover/DisplayPopover.tsx` |
| Table display preferences | Web `DisplayPopover` with the shared popover | `apps/web/src/features/table/DisplayPopover/DisplayPopover.tsx` |
| Collapsible data groups | `GroupHeader` | `packages/ui/src/domain/GroupHeader/GroupHeader.tsx` |
| Ticket detail sections | `SectionHeader` | `packages/ui/src/primitives/SectionHeader/SectionHeader.tsx` |
| Property label and value | `PropertyRow` | `packages/ui/src/primitives/PropertyRow/PropertyRow.tsx` |
| Ticket table rows | `Row`, with `columns` and `rowHeights` | `apps/web/src/features/table/Row/Row.tsx` |
| Review and mention rows | `InboxRow` | `packages/ui/src/domain/InboxRow/InboxRow.tsx` |
| Ticket identity and state | `TicketId`, `PriorityIcon`, `StatusIcon` | `packages/ui/src/domain/` |
| Assigned ticket agent, provider, and agent work state | `ActorAvatar` with the shared `Avatar` | `apps/web/src/features/agents/ActorAvatar/ActorAvatar.tsx` |
| Added and deleted lines of a workspace | `LineChanges` | `packages/ui/src/domain/LineChanges/LineChanges.tsx` |
| Row actions | `Menu`, `IconButton`, `Tooltip` | `packages/ui/src/primitives/Menu/Menu.tsx` |
| Edit a short value in place | `InlineEdit` | `packages/ui/src/primitives/InlineEdit/InlineEdit.tsx` |
| Usage per day | `UsageChart` | `packages/ui/src/domain/UsageChart/UsageChart.tsx` |
| Ranked slices of a whole | `RankedBars` | `packages/ui/src/domain/RankedBars/RankedBars.tsx` |
| Composition of one total | `StackedBar` | `packages/ui/src/domain/StackedBar/StackedBar.tsx` |
| Summary of GitHub check outcomes | `CheckRing` | `packages/ui/src/domain/CheckRing/CheckRing.tsx` |
| Composition of each part of a whole | `StackedBarList` | `packages/ui/src/domain/StackedBarList/StackedBarList.tsx` |
| Company mark of a model | `ProviderIcon` | `packages/ui/src/domain/ProviderIcon/ProviderIcon.tsx` |
| Subscription quota meters | `QuotaWindows` | `packages/ui/src/domain/QuotaWindows/QuotaWindows.tsx` |
| Flow run header | `FlowRunSummary` | `packages/ui/src/domain/FlowRunSummary/FlowRunSummary.tsx` |
| Flow run steps | `FlowRunTree` | `packages/ui/src/domain/FlowRunTree/FlowRunTree.tsx` |

## Edit a short value in place

Use `InlineEdit` wherever a person renames a thing without leaving the page.
It is the only in-place edit in the product, so a person meets the same rules on every screen.
Do not hold the edit state by hand, and do not add a per-screen option to any rule below.
The component removes the spaces at the two ends of the value and sends the rest.

1. Enter saves the typed value. Losing the focus also saves it.
2. Escape cancels, and only Escape. The saved value comes back.
3. An empty value that a person sends with Enter is refused. The field stays open and says "Enter a name.".
4. An empty value that loses the focus cancels, so nobody is held in a field that a phone keyboard cannot leave.
5. A value equal to the saved one closes the field. The field sends nothing.
6. The new value waits for the server. The field takes no more typing until the server answers.
7. A refusal keeps the field open with the typed value, draws the red border, takes the focus back, and names the reason.
8. Enter and Escape give the focus to the value. A click outside leaves the focus where the person clicked.
9. At rest the value is plain text at the size of the text beside it: no box, no pencil, no underline.

The list above is `inlineEditRules` in `packages/ui/src/primitives/InlineEdit/inlineEditRules.ts`.
The gallery section Inline edit draws the same list beside a live example, and a test fails when this page and that list differ.

A refusal speaks through a toast, because a row 32 px tall has no room for a line of text under the field.
The screen owns the `editing` flag, because the Rename action that starts the edit sits in a row menu beside the value.
The screen passes its own resting view as the children, and its own avatar as `leading` where a row has one.
Inside a row that is a link, the screen draws no row while the field is open, so no key press navigates.
A form with more than one field is not an in-place edit. Use a sheet or a row editor for it.

## Pages in a sheet

Use `PageSheet` to show a ticket or a pull request over the current page.
Render the same page component as the route. Do not build a compact copy of the page.
`Topbar` renders the title and the actions of the page into the header of the sheet.
The header adds the Open full page and Close buttons, and it shows them while the page loads.
Read `usePageSheet` where a page must differ in a sheet, such as an action that returns to a list.

`pageSheetStore` holds the sheet stack: one ticket with one pull request over it.
`PageSheetHost` mounts once in the root shell and draws the stack.
Open a ticket with `pageSheetActions.openTicket`, and a pull request with `pageSheetActions.openPullRequest`.
Give a ticket name in a list the `TicketLink` component: a plain click opens the sheet, and the href keeps the ticket page for a new tab.
A list never navigates to `/t/$identifier`. The route stays for a link that arrives from outside the app.
The review sheet takes the wide width, so it covers the ticket sheet under it.
Escape, the back gesture and a click beside the sheets close the top sheet only.

## Links to a web page

Send every control that leads to a web page through `openLink`.
On the desktop app it opens the page in `BrowserSheet`, the in-app browser, over the sheet the person reads.
In a browser it opens a new tab.
An anchor with `target="_blank"` needs no handler: `LinkCapture` sends it to the same sheet.
The sheet header holds Back, Forward, Reload, and Open in browser, which hands the address to the browser of the operating system.

## Filters and display options

Place filter chips beside the page title. Align Filter and Display at the right in the shared `FilterBar`.
Filter uses the funnel icon. Display uses the sliders icon. Both use circular `IconButton` triggers with tooltips.
The filter picker uses `FilterPopover` and `Command`. Selected filters use `Chip`, with an edit action and a remove action.
The `f` shortcut opens the filter picker.
The `epic` stage of the picker lists the epics of the project from `epics.list` and the choice No epic.
The chip prints the epic name, or No epic for `none`.
The `wave` stage shows only when the route has a project. It lists the waves of the epics of the project, grouped by epic name, and the choice No wave.
The chip prints the wave name, or No wave for `none`.

Use `ModelPicker` for each model field. It groups models by family and shows the provider mark.

Put the sort field and direction inside `DisplayPopover`. Use one option per field and a separate direction button.
The direction button shows the current direction through its icon and tooltip.
`DisplayPopover` offers Group by Epic. The group label is the epic name, and No epic is the last group.
`DisplayPopover` offers Group by Wave. The groups follow the wave position order, and No wave is the last group.
When the rows come from one epic, the count slot of a wave `GroupHeader` prints `done/total` of the wave, expanded or collapsed. The Show action of a collapsed group prints its row count.
The first wave that is not done carries the `Badge` Current after its label. An open wave after it prints Later beside `done/total` in the count slot.
When the view names one epic, the wave groups hold the Done and Canceled tickets too, last in each group under the default sort. A done wave starts collapsed, and Show completed turns the closed rows off.
New ticket in this wave in the Wave actions `Menu` of such a group, and the `c` key, create a ticket inside the epic. The menu item also sets the wave of the group.
The page determines the initial direction for each field. The server applies the selected order before pagination.
Keep filters and sort in the URL. Keep local display preferences, such as collapsed groups, in `uiStore` under the route key.

Needs you filters Active, Snoozed, or Ignored items. Its sort fields are Priority, Created, Updated, and Title.
Priority defaults to highest first, then oldest ticket. Its groups remain Needs review and Mentioned.

## Group headers

Use `GroupHeader` for groups of data rows. Use `SectionHeader` for sections in ticket details and settings.
The data header has a band background, a collapse chevron, a label, and a muted count.
The header is 32 px on desktop and 48 px on a phone. Its label button reports the expanded state.
Keep group headers visible during scroll when the list permits it.
Use the count of all matching items, including pages that have not loaded. An unloaded count stays blank.
A collapsed group retains its count. Its Show action expands the group and prints the count of the rows it reveals.
A header takes one `Badge` after its label through `mark`, such as Current on a wave.

Write every section title in sentence case, such as Sub-tickets or The ask.
Pass `level={3}` for a header inside a region, such as Your answer inside the question block.
The size carries the level: 13 px for a region and 12 px for a part of a region.

## Board cards

The top row of a card prints the identifier trail. When the ticket has an epic, the epic name comes first: `Routine runtime · OP-32`.
The name is `text-xs text-fg-faint truncate` in the sans face, the separator is ` · `, and the trail keeps `shrink-0`.
A long name gives way and the identifier stays. The drag preview draws the same content.

## Epic pages

The epic page shows its tickets in the full-width `TicketTable` of the project table view. It has no page-specific row and no row menu of its own.
Its `Topbar` holds the `FilterBar` chips, the Display `IconButton`, a New wave `IconButton`, an Add `IconButton` with the `Tooltip` Add tickets, and the `Menu` with Edit and Delete.
Every wave of the epic draws a `GroupHeader`. A wave with no ticket shows one muted line, "No tickets in this wave.", and no Start wave.
New wave adds `Wave <n>` at the end and opens its name as a field in the header, with the text selected. Enter or blur saves, Escape keeps the name.
A wave header holds Add tickets to this wave (a list-plus `IconButton` with the `TicketPicker`) and a Wave actions `Menu`: New ticket in this wave, Rename, Move up, Move down, and Delete wave. The menu shows the keys F2, Alt+Shift+Up, and Alt+Shift+Down, which work on a focused header.
Delete wave asks first only when the wave holds tickets. The dialog names the tickets that move to No wave and the open agent runs among them.
A ticket row drags into another wave group or into No wave. An accent outline marks the group that takes the drop. The `w` key is the keyboard path: it opens the wave picker of the focused row or of the selection.
An epic with no ticket and no wave shows an `EmptyState` with the same New wave and Add tickets `IconButton`s as the `Topbar`.
The page fixes the `epic` filter. By default the table groups by wave.
The page holds no current line, no progress bar and no legend.
The `SectionHeader` Plan collapses the description through its Show or Hide `Button`. `uiStore` keeps its collapsed state under `<route key>#plan`.
The plan and the resources take at most half of the page card, so the table keeps rows on screen.
The page of an archived project shows the `ArchivedBanner` of the project routes at the top of the page card. The pending page draws the same `Topbar` with the `FilterBar`, so the bar keeps its shape when the epic arrives.
A row of the epics list page prints the current wave after the epic name in muted text: `<name> · <i> of <n>`.
The rows of the epics list page use the `rowHeights`, the hover band, the cell text sizes, the tabular numbers, and the trailing `Menu` slot width of the ticket table `Row`.

## Statistics page

`/statistics` is one system page in the sidebar nav rows. It holds two blocks, each one a `section` with a `SectionHeader`.
Block one lists every fault that no other screen reports: an agent run whose process is gone, a review message held or failed, and a flow run that waits or still runs.
One row states one fault. It names the oldest case by ticket, counts the rest, and prints the age of that case. A fault with no case draws no row, and a page with no fault at all draws one line that says nothing is broken.
Red marks a fault of the machine. Yellow marks the one fault a person clears, a held review message. Grey marks a flow run that still moves.
Block two measures the review loop over the last 30 merged pull requests. It holds one table of the five changes that took the most review threads from the person, and three lines: the threads by author, the changes sent back and merged with no verdict, and the median wait from ready to a verdict.
Every figure carries a source mark: `today` or `query`. A figure that the rows cannot answer prints what is missing in place of a number, such as the wait over a window where too few pull requests carry the ready stamp. The page never estimates a figure.
The page adds no second time window. At thirty merges a move of three is sampling, and the page cannot tell sampling from a change.

## Dense rows

Give each property a stable column. Let the title use the remaining width.
Reserve the actor column when a row has no actor. Align project names, avatars, times, and actions across rows.
Use the existing ticket table widths for identity, project, actor, and time columns.
Truncate long titles and project paths within their columns. Use tabular numbers for identifiers, counts, and times.
Keep secondary text, such as a mention excerpt, below the title. Do not repeat a full status label in every review row.

Use `ActorAvatar` when a row represents a ticket. It shows the provider mark and the work state for the agent run that is assigned to the ticket of the row.
A ticket with no assigned agent run shows no avatar. A human last actor never draws initials on a ticket. This rule holds for the table `Row`, the board card, the sub-ticket rows, the epic page, and Needs you.
When run data supplies a harness, hover over the provider mark to see the model and effort.
Keep status and priority indicators distinct from the row's action menu.
Use one circular action menu at the far right. Reserve its width even when its trigger is hidden.
Show the trigger on row hover, keyboard focus, an open menu, and touch screens.
Pass `triggerTooltip` to `Menu`; this attaches the tooltip to the actual menu trigger.

At phone widths, use the existing two-line row pattern. Keep the identifier, status, time, title, and actions readable.
Hide secondary columns before they squeeze the title. Keep every touch action at least 44 px.
Do not animate a sort, count change, or text change.

## Reference and verification

Linear separates filters from display preferences and places display options at the top right.
Its display options include sort direction, group counts, and sticky group headers.
See [Linear display options](https://linear.app/docs/display-options) and [Linear filters](https://linear.app/docs/filters).
Use these as references for data hierarchy. Trellis components and tokens govern the implementation.

Check populated, empty, loading, and error states. Check long titles and rows with and without an actor.
Verify the layout in both themes at desktop and phone widths.
Check keyboard access, focus return, filter removal, group collapse, sort direction, and URL persistence.
Run the linter and type checks for each page that uses a changed shared element.
