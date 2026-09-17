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
| Filter chips and controls | `FilterBar`, `Chip` | `packages/ui/src/domain/FilterBar/FilterBar.tsx` |
| Searchable filter choices | `FilterPopover`, `Command` | `packages/ui/src/domain/FilterPopover/FilterPopover.tsx` |
| Sort field and direction | `DisplayPopover` | `packages/ui/src/domain/DisplayPopover/DisplayPopover.tsx` |
| Table display preferences | Web `DisplayPopover` with the shared popover | `apps/web/src/features/table/DisplayPopover/DisplayPopover.tsx` |
| Collapsible data groups | `GroupHeader` | `packages/ui/src/domain/GroupHeader/GroupHeader.tsx` |
| Ticket detail sections | `SectionHeader` | `packages/ui/src/primitives/SectionHeader/SectionHeader.tsx` |
| Ticket table rows | `Row`, with `columns` and `rowHeights` | `apps/web/src/features/table/Row/Row.tsx` |
| Review and mention rows | `InboxRow` | `packages/ui/src/domain/InboxRow/InboxRow.tsx` |
| Ticket identity and state | `TicketId`, `PriorityIcon`, `StatusIcon` | `packages/ui/src/domain/` |
| Last actor and agent work state | `ActorAvatar` with the shared `Avatar` | `apps/web/src/features/agents/ActorAvatar/ActorAvatar.tsx` |
| Row actions | `Menu`, `IconButton`, `Tooltip` | `packages/ui/src/primitives/Menu/Menu.tsx` |
| Usage per day | `UsageChart` | `packages/ui/src/domain/UsageChart/UsageChart.tsx` |
| Ranked slices of a whole | `RankedBars` | `packages/ui/src/domain/RankedBars/RankedBars.tsx` |
| Composition of one total | `StackedBar` | `packages/ui/src/domain/StackedBar/StackedBar.tsx` |
| Company mark of a model | `ProviderIcon` | `packages/ui/src/domain/ProviderIcon/ProviderIcon.tsx` |
| Subscription quota meters | `QuotaWindows` | `packages/ui/src/domain/QuotaWindows/QuotaWindows.tsx` |

## Filters and display options

Place filter chips beside the page title. Align Filter and Display at the right in the shared `FilterBar`.
Filter uses the funnel icon. Display uses the sliders icon. Both use circular `IconButton` triggers with tooltips.
The filter picker uses `FilterPopover` and `Command`. Selected filters use `Chip`, with an edit action and a remove action.
The `f` shortcut opens the filter picker.

Put the sort field and direction inside `DisplayPopover`. Use one option per field and a separate direction button.
The direction button shows the current direction through its icon and tooltip.
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
A collapsed group retains its count. Its Show action expands the group.

## Dense rows

Give each property a stable column. Let the title use the remaining width.
Reserve the actor column when a row has no actor. Align project names, avatars, times, and actions across rows.
Use the existing ticket table widths for identity, project, actor, and time columns.
Truncate long titles and project paths within their columns. Use tabular numbers for identifiers, counts, and times.
Keep secondary text, such as a mention excerpt, below the title. Do not repeat a full status label in every review row.

Use `ActorAvatar` when a row represents the last actor. It includes the persona icon and the current work state.
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
