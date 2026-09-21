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
| Last actor, provider, and agent work state | `ActorAvatar` with the shared `Avatar` | `apps/web/src/features/agents/ActorAvatar/ActorAvatar.tsx` |
| Added and deleted lines of a workspace | `LineChanges` | `packages/ui/src/domain/LineChanges/LineChanges.tsx` |
| Row actions | `Menu`, `IconButton`, `Tooltip` | `packages/ui/src/primitives/Menu/Menu.tsx` |
| Usage per day | `UsageChart` | `packages/ui/src/domain/UsageChart/UsageChart.tsx` |
| Ranked slices of a whole | `RankedBars` | `packages/ui/src/domain/RankedBars/RankedBars.tsx` |
| Composition of one total | `StackedBar` | `packages/ui/src/domain/StackedBar/StackedBar.tsx` |
| Summary of GitHub check outcomes | `CheckRing` | `packages/ui/src/domain/CheckRing/CheckRing.tsx` |
| Composition of each part of a whole | `StackedBarList` | `packages/ui/src/domain/StackedBarList/StackedBarList.tsx` |
| Company mark of a model | `ProviderIcon` | `packages/ui/src/domain/ProviderIcon/ProviderIcon.tsx` |
| Subscription quota meters | `QuotaWindows` | `packages/ui/src/domain/QuotaWindows/QuotaWindows.tsx` |
| Flow run header | `FlowRunSummary` | `packages/ui/src/domain/FlowRunSummary/FlowRunSummary.tsx` |
| Flow run steps | `FlowRunTree` | `packages/ui/src/domain/FlowRunTree/FlowRunTree.tsx` |

## Pages in a sheet

Use `PageSheet` to show a ticket or a pull request over the current page, such as the ticket of a session.
Render the same page component as the route. Do not build a compact copy of the page.
`Topbar` renders the title and the actions of the page into the header of the sheet.
The header adds the Open full page and Close buttons, and it shows them while the page loads.
A page in a sheet opens a related page in a second `PageSheet`. A ticket does this for a pull request.
The second sheet is wider and covers the first one. Escape and an outside click close only the top sheet.
Read `usePageSheet` where a page must differ in a sheet, such as an action that returns to a list.

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
The `+` of such a group, and the `c` key, create a ticket inside the epic. The `+` also sets the wave of the group.
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

One rule holds for every header of the ticket page.
Write the title in sentence case and pass `textCase="caps"`, so a screen reader reads the words and the header draws in capitals.
Pass `level={3}` for a header inside a region, such as Flows or the merge conditions of a pull request card.
The size carries the level: 13 px for a region and 12 px for a part of a region. The case never carries the level.

## Board cards

The top row of a card prints the identifier trail. When the ticket has an epic, the epic name comes first: `Routine runtime · OP-32`.
The name is `text-xs text-fg-faint truncate` in the sans face, the separator is ` · `, and the trail keeps `shrink-0`.
A long name gives way and the identifier stays. The drag preview draws the same content.

## Epic pages

The epic page shows its tickets in the full-width `TicketTable` of the project table view. It has no page-specific row and no row menu of its own.
Its `Topbar` holds the `FilterBar` chips, the Display `IconButton`, an Add `IconButton` with the `Tooltip` Add tickets, and the `Menu` with Edit and Delete.
The page fixes the `epic` filter. By default the table groups by wave and lists the root project with its sub-projects.
The header band sits in the page padding. It opens with one line for the current wave: `Current: <name>`, then `<n> to start`, `<n> running`, and `<n> wait for you`.
A count is a link that sets the table filters inside that wave: `category=todo` for to start, `reviewer=human` for wait for you. Running is plain text, because the filter grammar has no filter for a working agent.
The band then holds the state `Badge`, the progress text, and the `StackedBar` of the epic with its legend.
A `StackedBarList` follows with one line per wave in position order: the wave name, the `Badge` Current on the current wave, the bar, and `done/total`. A wave bar has no legend, because the legend of the epic bar names the colors.
The `SectionHeader` Plan collapses the description through its Show or Hide `Button`. `uiStore` keeps its collapsed state under `<route key>#plan`.
The band and the plan take at most half of the page card, so the table keeps rows on screen.
The page of an archived project shows the `ArchivedBanner` of the project routes at the top of the page card. The pending page draws the same `Topbar` with the `FilterBar`, so the bar keeps its shape when the epic arrives.
A row of the epics list page prints the current wave after the epic name in muted text: `<name> · <i> of <n>`.
The rows of the epics list page use the `rowHeights`, the hover band, the cell text sizes, the tabular numbers, and the trailing `Menu` slot width of the ticket table `Row`.

## Dense rows

Give each property a stable column. Let the title use the remaining width.
Reserve the actor column when a row has no actor. Align project names, avatars, times, and actions across rows.
Use the existing ticket table widths for identity, project, actor, and time columns.
Truncate long titles and project paths within their columns. Use tabular numbers for identifiers, counts, and times.
Keep secondary text, such as a mention excerpt, below the title. Do not repeat a full status label in every review row.

Use `ActorAvatar` when a row represents the last actor. It shows the provider mark and the work state only for the agent run that is assigned to the ticket of the row.
A ticket with no assigned agent run shows its last actor without a provider mark. An agent actor then draws the agent mark with no provider. This rule holds for the table `Row`, the board card, the sub-ticket rows, the epic page, and Needs you.
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
