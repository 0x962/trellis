# UI patterns

Trellis uses one set of UI elements across its boards and tables.
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
| Section headings | `SectionHeader` | `packages/ui/src/primitives/SectionHeader/SectionHeader.tsx` |
| Static panels | `Panel` | `packages/ui/src/primitives/Panel/Panel.tsx` |
| Property label and value | `PropertyRow` | `packages/ui/src/primitives/PropertyRow/PropertyRow.tsx` |
| Ticket table rows | `Row`, with `columns` and `rowHeights` | `apps/web/src/features/table/Row/Row.tsx` |
| Ticket identity and state | `TicketId`, `PriorityIcon`, `StatusIcon` | `packages/ui/src/domain/` |
| Assigned ticket agent, provider, and agent work state | `ActorAvatar` with the shared `Avatar` | `apps/web/src/features/agents/ActorAvatar/ActorAvatar.tsx` |
| Added and deleted lines of a workspace | `LineChanges` | `packages/ui/src/domain/LineChanges/LineChanges.tsx` |
| Row actions | `Menu`, `IconButton`, `Tooltip` | `packages/ui/src/primitives/Menu/Menu.tsx` |
| Page tab actions | `ContextMenu`, `ContextMenuTrigger` | `packages/ui/src/primitives/ContextMenu/ContextMenu.tsx` |
| Edit a short value in place | `InlineEdit` | `packages/ui/src/primitives/InlineEdit/InlineEdit.tsx` |
| Usage per day | `UsageChart` | `packages/ui/src/domain/UsageChart/UsageChart.tsx` |
| Ranked slices of a whole | `RankedBars` | `packages/ui/src/domain/RankedBars/RankedBars.tsx` |
| Composition of one total | `StackedBar` | `packages/ui/src/domain/StackedBar/StackedBar.tsx` |
| Summary of GitHub check outcomes | `CheckRing` | `packages/ui/src/domain/CheckRing/CheckRing.tsx` |
| Composition of each part of a whole | `StackedBarList` | `packages/ui/src/domain/StackedBarList/StackedBarList.tsx` |
| Mark of a gateway | `ProviderIcon` | `packages/ui/src/domain/ProviderIcon/ProviderIcon.tsx` |
| Provider key status and model choices | `ProviderCard`, `ProviderForm` | `packages/ui/src/domain/ProviderCard/ProviderCard.tsx` |
| Company mark of a model | `ProviderIcon` | `packages/ui/src/domain/ProviderIcon/ProviderIcon.tsx` |
| Subscription quota meters | `QuotaWindows` | `packages/ui/src/domain/QuotaWindows/QuotaWindows.tsx` |
| Flow run header | `FlowRunSummary` | `packages/ui/src/domain/FlowRunSummary/FlowRunSummary.tsx` |
| Flow run steps | `FlowRunTree` | `packages/ui/src/domain/FlowRunTree/FlowRunTree.tsx` |
| Anything that failed | `FailureState` | `packages/ui/src/domain/FailureState/FailureState.tsx` |
| A document with its contents | `DocumentLayout` | `packages/ui/src/domain/DocumentLayout/DocumentLayout.tsx` |

## Form fields and type

`Field` owns the label, control, trailing action, and one hint slot.
`Input`, `Textarea`, and `Select` use it internally. `ProjectColorField` uses it around its control.
A composed control inside an existing `Field` uses that field's label and description.
The control receives the label ID, the hint ID, and the field state.
A custom control must forward these props to its focusable element.

| Form text | Token | Size |
| --- | --- | --- |
| Page title | `text-xl` (`--text-xl`) | 20 px |
| Section title | `text-md` (`--text-md`) | 14 px |
| Label and control value | `text-sm` (`--text-sm`) | 12 px |
| Hint, page description, and save status | `text-xs` (`--text-xs`) | 11 px |

A form uses these four sizes. `FieldHint` supplies the shared hint style for section descriptions.
`Select` hides its label by default for compact controls. A form sets `hideLabel={false}`.

| Field variant | Props | Hint slot |
| --- | --- | --- |
| Default | `label`, optional `hint` | What the value does |
| Disabled | `disabled` | What the value does |
| Invalid | `error` | The error message replaces the hint |
| Read-only | `readOnly`, `readOnlyReason` | The reason replaces the hint |
| Trailing action | `trailingAction` | What the value does |

An error takes precedence over a read-only reason.
A trailing icon action uses `IconButton` inside `Tooltip`.
A read-only text value remains selectable and focusable.
Text fields and document editors use `fg-faint` for visible focus borders and outlines.
The existing soft ring and danger border retain their roles.
A hint states what the value does. For example, "Every ticket ID starts with OP."
A field uses its hint slot for an error or reason, with no second message beneath it.
`FormStatus` reports a save through `status` and optional `message`.
Its states are `idle`, `saving`, `saved`, and `error`. It reserves one hint line in every state.
The Field gallery section shows all five variants and the save states.

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

### Which shape an edit takes

The product keeps two shapes. What the control changes picks the shape, not the page it stands on.

- One short value of a record that exists: `InlineEdit`, in the row or the header that prints the value.
- More than one field at once, or a record that does not exist yet: a row editor or a sheet, with Cancel and Save.

| Edit | Shape | Reference |
| --- | --- | --- |
| Wave name | `InlineEdit` in the wave `GroupHeader` | `apps/web/src/features/table/WaveHeader/components/WaveName/WaveName.tsx` |
| Label group name | `InlineEdit` in the heading band of the group | `apps/web/src/features/project-settings/LabelGroupRow/LabelGroupRow.tsx` |
| Session name, attachment name | `InlineEdit` in the row | `apps/web/src/features/sessions/SessionName/SessionName.tsx` |
| Label: name, color, description | Row editor under the label row | `apps/web/src/features/project-settings/LabelEditor/LabelEditor.tsx` |
| Status: name, color, description, default | Row editor under the status row | `apps/web/src/features/project-settings/StatusRow/components/StatusEditor/StatusEditor.tsx` |
| Epic: name and plan | Sheet | `apps/web/src/features/epics/EpicSheet/EpicSheet.tsx` |
| A new label, label group or status | Form with Cancel and Save | `apps/web/src/features/project-settings/StatusCreateForm/StatusCreateForm.tsx` |

A document of the Resources tab of an epic keeps its own shape. Its title and its body save while the person types, so it is no in-place edit of one value.

`DocumentLayout` places Contents to the right of the document.
Below the `--container-3xl` width, the circular Contents action opens a popover.
The popover uses `--popover-max-height` and the available screen height.
The comments pane uses its own space beside that region.
The list follows headings at all six levels as the person edits the document.
Each row scrolls the document to its heading. Duplicate names keep separate targets.
Long names wrap, and an empty heading reads Untitled heading.
The virtual list measures wrapped rows and keeps the focused heading mounted.
Arrow keys, Home, End, and Tab reach headings outside the visible rows.

## Project-owned HTML Pages

The project Pages list uses `PageRow`, the shared filter controls, and keyset pagination.
The Page detail uses `Topbar`, `InlineEdit`, `Menu`, `Sheet`, and `ConfirmDialog`.
History uses `PageVersionRow`. Share copies the stable internal link.

`PageViewer` holds the fixed wrapper URL for the selected version.
The Page document stays inside its sandboxed child frame.
`PageCommentPin` places comment numbers over the viewer without moving the document.
`ReviewThreadCard` and `ReviewCommentEditor` supply the comment controls.

At widths of 80 rem or more, comments occupy a right pane.
Below that width, the circular Comments action opens the shared sheet.
Historical views identify their version and show read-only comments.
Lease refresh restores the scroll position immediately and announces its status through a polite live region.
Comment reveal respects `prefers-reduced-motion`.

The [Pages guide](pages.md) lists the release checks for phone widths, zoom, keyboard access, and desktop links.

## Pages in a sheet

`Sheet` owns the appearance of every slideout, including forms and pages.
Its `description` prop shows the introductory text and supplies the accessible description.
It uses `rounded-xl` on the exposed corners and the `shadow-page-sheet` token.
The corners face left for a right sheet and right for a left sheet.
The sheet clips its content to these corners.
Below the `md` breakpoint, the corners stay square.

Use `PageSheet` to show a ticket or a pull request over the current page.
Render the complete ticket or review content. Do not build a compact copy.
`Topbar` renders the title and the actions of the page into the header of the sheet.
The header keeps Close visible while the content loads.
A pull request also has Open full page. A ticket uses only the sheet.
Read `usePageSheet` where a page must differ in a sheet, such as an action that returns to a list.

`pageSheetStore` holds the sheet stack: one ticket with one pull request over it.
`PageSheetHost` mounts once in the root shell and draws the stack.
Open a ticket with `pageSheetActions.openTicket`, and a pull request with `pageSheetActions.openPullRequest`.
Give a ticket name in a list the `TicketLink` component. A plain click opens the sheet over the current page.
A list never navigates to `/t/$identifier`.
This URL opens the sheet over the home page when a link arrives from outside the app or opens in a new tab.
It replaces the URL with the home route, so closing the sheet leaves a page to use.
The table's Enter, Space, and O keys open the same sheet.
In the project session list, hold T and click a ticket agent to open its ticket sheet directly.
A plain click selects the conversation. A session without a ticket keeps this behavior with T held.
Hold S and click a ticket to open its existing agent session. The choice matches the ticket agent line.
A ticket without a session opens its ticket sheet. S alone opens the status picker on key release.
Markdown links and resolved ticket record links also open the sheet over the current page.
Page links inside a session open the complete Page viewer in a sheet above that session.
The session keeps its content, and the background route stays in place.
Version history and comment-version links update the Page sheet.
Close returns to the session. On desktop, external links use the browser sheet above the Page.
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

Record pickers use a typed Create row when the name has no exact match.
`createNameItem` supplies that row from the loaded names.
`usePickerCreate` prevents repeated submissions and selects the returned record after the cache refresh.
The project, status, and account pickers reuse their create forms for required fields.
A wave needs an explicit epic. An unscoped wave filter opens a form with `EpicPicker` before it creates the wave.
Fixed lists, such as priority and status category, keep their defined values.

Use `Command.Virtual` for a large collection. It accepts stable item IDs, labels, optional search keywords, groups, checked items, and the current item. Pinned items remain available during search. The search callback supplies text for an option that adds a typed value. It uses the shared Command field, rows, and empty state. Search and keyboard selection use the full collection while the list mounts nearby rows and the selected row. Arrow keys, Home, End, Page Up, and Page Down move the selection. Enter selects an item.
The `f` shortcut opens the filter picker.
The `epic` stage of the picker lists the epics of the project from `epics.list` and the choice No epic.
The chip prints the epic name, or No epic for `none`.
The `wave` stage shows only when the route has a project. It lists the waves of the epics of the project, grouped by epic name, and the choice No wave.
The chip prints the wave name, or No wave for `none`.

Use `ModelPicker` for each model field. It groups models by family and shows the provider mark.

Put the sort field and direction inside `DisplayPopover`. Use one option per field and a separate direction button.
The direction button shows the current direction through its icon and tooltip.
Epic ticket views offer Priority, Created, Status, and ID as sort fields. Their default is ascending ID within each ticket rank.
An epic URL with either Updated direction uses the default order.
`DisplayPopover` offers Group by Epic. The group label is the epic name, and No epic is the last group.
`DisplayPopover` offers Group by Wave. Open waves follow the wave position order, then No wave, then done waves in position order.
When the rows come from one epic, the count slot of a wave `GroupHeader` prints `done/total` of the wave, expanded or collapsed. The Show action of a collapsed group prints its row count.
The first wave that is not done carries the `Badge` Current after its label. An open wave after it prints Later beside `done/total` in the count slot.
When the view names one epic, the wave groups hold the Done and Canceled tickets too, last in each group under the default sort. A done wave starts collapsed, and Show completed turns the closed rows off.
New ticket in this wave in the Wave actions `Menu` of such a group, and the `c` key, create a ticket inside the epic. The menu item also sets the wave of the group.
The page determines the initial direction for each field. The server applies the selected order before pagination.
Each epic saves its filters and sort field and direction in local storage on the current device.
An epic link without filters restores that epic's saved filters into the URL.
An epic link without a sort restores that epic's saved order into the URL.
Explicit URL filters replace the saved filters. An explicit URL sort replaces the saved order.
A filter or sort change saves immediately. The default ID order also saves.
Reloads and app restarts retain these settings. Link previews leave saved settings unchanged.
Keep filters and sort in the URL. Keep local display preferences, such as collapsed groups, in `uiStore` under the route key.

## Ticket range selection

Select a ticket checkbox. Hold Shift and click another ticket checkbox or row to select the inclusive range.
The range follows the displayed ticket order across expanded groups and scroll positions.
Collapsed groups stay outside the range. Earlier selections outside the range stay selected.
If the anchor ticket leaves the view, the next Shift click starts a new range.

## Group headers

Use `GroupHeader` for groups of data rows and controlled disclosure regions. Use `SectionHeader` for section headings. Its `level` sets the heading depth. The `overview` and `prominent` appearances set the title size independently of that depth.

Use `Panel` for a static frame around summary data or charts. The caller supplies the content and padding.
The data header has a rounded inset band, a collapse chevron, a label, and a muted count.
The band starts 12 px inside a desktop list and 8 px inside a phone list.
Keep the label aligned with the rows by reducing the padding inside the band.
Keep row borders full width. Give the row hover, focus, and selection grounds the same inset rounded boundary.
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
Its `Topbar` holds the `FilterBar` chips, the Display `IconButton`, a Broadcast `IconButton`, an Add menu, and the epic actions `Menu`.
The Broadcast control opens the shared broadcast dialog with the epic name and its working and idle recipient counts.
It selects agents across the epic, independent of the ticket filters.
The Add menu uses a plus `IconButton` with the `Tooltip` Add. Its options are Ticket and Wave.
Ticket opens the project `TicketPicker`. Wave creates a wave through the existing wave actions.
The epic actions menu holds Copy as CLI, Copy link, Edit, and Delete.
The share commands retain the current filters and the epic scope.
Every wave of the epic draws a `GroupHeader`. A wave with no ticket shows one muted line, "No tickets in this wave.", and no Start wave.
Start wave opens one surface with a dependency tree, status icons, and checkboxes.
Ready, unassigned Todo tickets start checked. Waiting Todo tickets remain available for an explicit start.
Each ticket appears under its first unfinished prerequisite in the wave. Its row names every unfinished prerequisite, including other waves.
Assigned tickets and tickets outside Todo remain visible with disabled checkboxes.
The compact agent picker beside Start holds the shared harness, model, and effort fields.
Submission locks the selection and agent choice. Each accepted request updates its ticket immediately.
A failed request shows its complete error. Retry sends only failed tickets with their original request identifiers and agent choice.
The Wave option adds `Wave <n>` at the end and opens its name as a field in the header. The field is the `InlineEdit` of the in-place edit, and the collapse button of the header takes the focus back after Enter and after Escape.
A wave header holds Add tickets to this wave (a list-plus `IconButton` with the `TicketPicker`) and a Wave actions `Menu`: New ticket in this wave, Rename, Move up, Move down, and Delete wave. The menu shows the keys F2, Alt+Shift+Up, and Alt+Shift+Down, which work on a focused header.
Delete wave asks first only when the wave holds tickets. The dialog names the tickets that move to No wave and the open agent runs among them.
A ticket row drags into another wave group or into No wave. An accent outline marks the group that takes the drop. The `w` key is the keyboard path: it opens the wave picker of the focused row or of the selection.
An epic with no ticket and no wave shows an `EmptyState` with the same Add menu as the `Topbar`.
The page fixes the `epic` filter. By default the table groups by wave.
The page holds no current line, no progress bar and no legend.
The `SectionHeader` Plan collapses the description through its Show or Hide `Button`. `uiStore` keeps its collapsed state under `<route key>#plan`.
The plan and the resources take at most half of the page card, so the table keeps rows on screen.
The page of an archived project shows the `ArchivedBanner` of the project routes at the top of the page card. The pending page draws the same `Topbar` with the `FilterBar`, so the bar keeps its shape when the epic arrives.
A row of the epics list page prints the current wave after the epic name in muted text: `<name> · <i> of <n>`.
The rows of the epics list page use the `rowHeights`, the hover band, the cell text sizes, the tabular numbers, and the trailing `Menu` slot width of the ticket table `Row`.

## Agent prompt settings

The Agent prompt section of Settings uses TipTap to edit the complete startup template as plain source text.
Variable fields use `{{name}}` syntax and a highlight. An unknown variable uses the danger treatment and prevents a save.
The shared `Select` inserts a variable at the current text selection. The form uses the existing Save, Cancel, and Use default buttons.
Use default changes the draft. Save prompt commits it. A load error uses `FailureState`, and a save error uses `FormStatus`.

## Failures

Every screen that reports a failure draws `FailureState`. It is the one shape, so a person reads the same block whatever broke. Its docstring holds these rules, and the gallery section prints them.

The title says what happened in plain words. It never carries an exit code, an exception class, a process line or a file path.
One line under the title says what trellis does about the failure: `recovery="retrying"` while trellis sends the request again, `recovery="waiting"` while trellis holds the page until the server answers, and nothing when trellis does nothing.
A failure that recovers by itself clears itself. `RouteError` loads the route again when the live connection comes back, so a person who waits never presses Retry.
The block carries one action, and at most two. `action` is the one that usually works, and it sits beside the words. A screen never puts the only way out in a bar somewhere else.
`detail` holds the raw text a developer reads. A closed disclosure holds it under the action, the text stays selectable, and the title never shows it.
The words carry no blame, no apology and no exclamation mark. Red marks one thing: the small sign beside the title.
`variant="page"` fills a route or a pane and draws the animal card from `EmptyState`. Each new card requests a random photo from Dog CEO, Cataas, or RandomFox. The photo stays fixed during updates to that card. The card reserves space while the request runs. An unavailable photo leaves that space empty. `variant="section"` sits inside a tab or a list and draws no picture.

`EmptyState` stays the block for a list or a page that holds nothing. A state that is not a failure keeps it, such as a session that a person stopped.

## Usage providers

The Agent Usage tab puts Providers directly under Accounts.
`ProviderCard` is the second card shape on the page. It shows the key status, balance, and selected models.
Account details, sign-in instructions, account forms, and `ProviderForm` use the shared `Sheet` and `SheetBody`.
The slideout opens from the right and keeps Usage behind it.
Edit leaves the key blank and preserves it until a person enters a replacement.
The model control uses `Popover`, `PickerButton`, `Command.Virtual`, and `Chip`. It accepts an identifier outside the catalog. Selected models use the shared virtual row hook in a scrollable viewport. Arrow keys, Home, End, Page Up, and Page Down reach remove buttons throughout the selection.
The remove action uses `ConfirmDialog`. Provider changes show in place without a toast or a card animation.

## Dense rows

Give each property a stable column. Let the title use the remaining width.
Reserve the actor column when a row has no actor. Align project names, avatars, times, and actions across rows.
Use the existing ticket table widths for identity, project, actor, and time columns.
Truncate long titles and project paths within their columns. Use tabular numbers for identifiers, counts, and times.
Keep secondary text, such as a mention excerpt, below the title. Do not repeat a full status label in every review row.

Use `ActorAvatar` when a row represents a ticket. It shows the provider mark and the work state for the agent run that is assigned to the ticket of the row.
A ticket with no assigned agent shows the wave header's play control when the pointer enters its agent slot or the control receives keyboard focus. Touch devices keep the control visible. The control uses the most recent successful assignment choice. An invalid choice opens the shared assignment dialog. The assignment query must confirm that the ticket has no agent before the control appears. Completed tickets, archived projects, and drag previews keep the slot read only. The control keeps the current page open. A human last actor never draws initials on a ticket. This rule holds for the table `Row`, the board card, the sub-ticket rows, and the epic page.
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

## Create a ticket

The ticket composer uses `TicketComposer`, `ComposerTitle`, and `ComposerProperty`.
The header selects the project. The title and description come before the properties.
The property row holds status, priority, agent, placement, and labels.
More properties holds the parent picker and Discard draft.
The agent picker searches the supported models of each harness. Its account and effort fields use the current harness.
Create and assign saves the ticket, uploads its attachments, and starts the selected agent.
Assign agent selects whether the primary action starts the selected agent.
When Assign agent is off, Create saves the ticket and uploads its attachments without an assignment.
No agent also changes the action to Create.
The browser retains Assign agent and Create another across tickets and app restarts.
A failed upload or assignment keeps the saved ticket. An assignment retry keeps its original request ID.
Close and Escape retain the draft and selected files. Create another clears the content and retains the settings.
Command+Enter creates the ticket. Command+Shift+Enter also keeps the composer open.
On other platforms, Control replaces Command.

## Broadcast a message

The broadcast dialog uses the ticket composer shell through `BroadcastComposer`.
Its header names the epic or all of Trellis. The message comes before the working and idle recipient choices.
The footer shows the current recipient count in Send. An empty message, no selected group, or an unavailable count prevents sending.
Command+Enter and Control+Enter use the same send action. Shift does not keep the composer open for another message.
A pending delivery prevents sending and closing. The result receives focus and reports accepted deliveries and each failed recipient.
Done closes the dialog and returns focus to its opener. The phone layout keeps the header and footer visible while the body scrolls.

### Session composer

New Session uses `TicketComposer`, `ComposerHeader`, `ComposerTitle`, and `ComposerAgentPicker` from the ticket composer.
The header selects a project or No project. The session name stays optional, and the prompt takes initial focus.
The agent picker holds the harness, model, effort, and account. Automatic account selection continues until a person selects an account.
The footer holds Add attachment and Start session. Paste and drop also add files.
Escape and Close keep the draft and its files. Command-Enter or Control-Enter starts the session from any field.
The pending request disables edits and Close. A failure keeps the draft and shows its details through `FailureState`.

## Rewrite a prompt

Select all text in a multiline field, then press L twice within 300 milliseconds.
Control+A or Command+A selects the complete field.
The shortcut covers textareas, ticket and document descriptions, the ticket composer, role bodies, and the agent prompt template.
A read-only field, terminal, or unregistered editor keeps its normal keys.
One L, or L followed by another key, enters normal text.
The rewrite uses the configured Vercel provider and the feature's text model.
The instruction requires the model to preserve every requirement, constraint, identifier, number, and quoted value.
A status toast reports progress. A successful replacement offers Undo and preserves the editor's undo history.
A failed request retains the original text.
An edit, focus change, document switch, or closed editor prevents a late result from replacing the field.
