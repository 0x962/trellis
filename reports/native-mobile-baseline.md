# Native mobile baseline

## Record

| Field | Value |
| --- | --- |
| Ticket | TRL-1344 |
| Parent | TRL-1334 |
| Inspection date | 2026-10-07 UTC |
| Source | `e0f0450215d603def5728d343347908a5ade43b3` |
| Remote base | `origin/main` at the same source |
| Boxd machine | `trl1334-mobile` |
| Remote checkout | `/home/boxd/worktrees/trl-1344` |
| Product source edits | None |

This report inventories the native mobile feature before product edits. The review covers all 147 tracked files under `apps/mobile`. The feature contains 48 TSX files, 10 route files, 4,559 source lines, and one test file.

The app uses Expo 57, React Native 0.86, expo-router, TanStack Query, oRPC, FlashList, NativeWind, and expo-sqlite. It runs in Expo Go without a native build step. Evidence: `apps/mobile/README.md:1-28`, `apps/mobile/package.json:1-45`, and `apps/mobile/app.json:1-30`.

No separate native-only package exists outside `apps/mobile`. Mobile code imports shared contracts and clients from `@trellis/api`. It does not import `@trellis/ui`. The native-only shared modules are the components, hooks, libraries, and theme modules under `apps/mobile/src`.

## Route and navigation inventory

| Route | Purpose | Entry | Exit |
| --- | --- | --- | --- |
| `/` | Redirect | App launch | Search |
| `/setup` | Server setup and identity | Fresh install, Settings, pair link | Back or Search |
| `/pair?url=...` | Pair-link redirect | `trellis://pair` | Setup with the URL |
| `/(search)/search` | Ticket and Page search | Search tab | Ticket |
| `/(projects)/projects` | Active project list | Projects tab | Project |
| `/(projects)/project/[ref]` | Project tickets | Project row | Ticket |
| `/(settings)/settings` | Identity, server, theme, version | Settings tab | Setup |
| `ticket/[identifier]` | Ticket detail in each tab stack | Search, project, parent, or child | Back or another ticket |

The root protects all tabs until the store has a server URL and a name. Setup and Pair do not appear in the tab bar. Evidence: `apps/mobile/app/_layout.tsx:19-29` and `apps/mobile/app/_layout.tsx:85-101`.

Search, Projects, and Settings each own a stack. A ticket stays inside the tab that opened it. A parent or child ticket can push another ticket on the same stack. Evidence: `apps/mobile/app/(search,projects,settings)/_layout.tsx:5-37`.

The launch route redirects to Search. Evidence: `apps/mobile/app/index.tsx:1-5`. A pair link redirects to Setup and keeps Save as a user action. Evidence: `apps/mobile/app/pair.tsx:3-9`.

External navigation has two paths. A pull request opens in the system browser. A non-inline attachment opens in the system browser. Evidence: `apps/mobile/src/ticket/PrCard/PrCard.tsx:59-82` and `apps/mobile/src/ticket/Attachments/Attachments.tsx:71-87`.

## Journey inventory

### Setup and pairing

The fresh-install journey starts on Setup. The user types a server URL or scans a QR code. The user tests the connection, enters a name, and saves both values.

Setup has these states:

- Default URL field with `http://`.
- Invalid URL message.
- Invalid actor-name note.
- Connection test in progress.
- Timeout after three seconds.
- Unreachable server.
- Non-Trellis server.
- Successful probe with version, ticket count, and server actor.
- QR scanner open.
- Camera permission pending.
- Camera permission granted.
- Camera permission denied.
- Invalid QR code.
- Save disabled.
- Save enabled.
- Existing-server replacement.

Evidence: `apps/mobile/app/setup.tsx:20-35`, `apps/mobile/app/setup.tsx:43-134`, and `apps/mobile/app/setup.tsx:136-175`.

A pair link and a QR scan use the same validation and probe path. A server change clears the old query cache before it saves the new URL. Evidence: `apps/mobile/app/setup.tsx:98-128`.

The QR scanner accepts one QR code. It asks for camera access when it opens. A denied request shows instructions and a Cancel action. Evidence: `apps/mobile/src/features/setup/QrScanner/QrScanner.tsx:20-54`.

### Search

Search waits 120 ms after text input. It requests 20 results. An exact ticket identifier opens that ticket when the user submits the field. Evidence: `apps/mobile/src/lib/useDebouncedValue/useDebouncedValue.ts:3-18` and `apps/mobile/src/features/search/searchQuery/searchQuery.ts:3-16`.

Search has these states:

- No recent searches.
- Up to eight recent searches.
- Request pending.
- Replaced request pending.
- Request failed.
- No results.
- Ticket results.
- Page results.

A successful typing session replaces one recent-search slot. The store keeps the newest eight searches. Evidence: `apps/mobile/app/(search)/search.tsx:37-54` and `apps/mobile/src/features/search/recentSearches/recentSearches.ts:1-29`.

Ticket results open a ticket. Page results render as static rows. They have no press action and no native Page route. Evidence: `apps/mobile/src/features/search/SearchResults/SearchResults.tsx:13-27`, `apps/mobile/src/features/search/SearchResults/components/PageRow/PageRow.tsx:11-24`, and `apps/mobile/src/components/Row/Row.tsx:47-72`.

### Projects

Projects lists active projects in project position order. Archived projects do not appear. A project opens its ticket list. Evidence: `apps/mobile/app/(projects)/projects.tsx:9-22` and `apps/mobile/src/features/projects/ProjectTree/ProjectTree.tsx:5-24`.

The project list has pending, error, empty, and populated states. The pending state renders no content. The error state shows the server detail without an action. Evidence: `apps/mobile/app/(projects)/projects.tsx:9-20`.

A project screen shows its name after the project query completes. The screen contains two segmented controls:

- Active, Review, Done.
- Created, Updated, Priority.

The list reads 25 tickets per page. It loads another page at the list end. It includes empty, unreachable, server-error, retry, and populated states. Evidence: `apps/mobile/src/features/projects/ProjectTicketList/ProjectTicketList.tsx:22-40`, `apps/mobile/src/features/projects/ProjectTicketList/ProjectTicketList.tsx:48-103`, and `apps/mobile/src/features/projects/ProjectTicketList/listQuery.ts:3-43`.

The selected project filter and sort live in component state. They reset when the screen unmounts. Evidence: `apps/mobile/src/features/projects/ProjectTicketList/ProjectTicketList.tsx:48-51`.

### Ticket

Ticket detail has loading, not-found, generic-error, and loaded states. Loading uses an activity indicator. The error states do not offer Retry or Change server. Evidence: `apps/mobile/app/(search,projects,settings)/ticket/[identifier].tsx:15-34`.

The loaded ticket contains these sections:

- Title.
- Review actions when the status category is Review.
- Status, priority, project, and parent property grid.
- Read-only Markdown description.
- Sub-tickets and progress.
- Pull request cards.
- Attachments.
- Timeline.
- Load earlier action.

Evidence: `apps/mobile/src/ticket/TicketView/TicketView.tsx:92-145`.

The ticket has these mutation journeys:

- Change status in a status sheet.
- Change priority in a priority sheet.
- Approve a review ticket.
- Send a review ticket back with a reason.
- Open a parent ticket.
- Open a child ticket.

Status and priority changes use an optimistic cache value. A version conflict replaces it with the server row. Another error restores the previous row. Evidence: `apps/mobile/src/ticket/ticketUpdate/ticketUpdate.ts:11-35`.

Approve selects the next configured status. Send back selects the first Started status and messages an assigned agent when one exists. Evidence: `apps/mobile/src/ticket/reviewTargets/reviewTargets.ts:4-19` and `apps/mobile/src/ticket/ticketQueries/ticketQueries.ts:63-90`.

A rejected mutation shows a danger banner above the ticket. The next mutation clears it. Evidence: `apps/mobile/src/ticket/useTicketUpdate/useTicketUpdate.ts:9-26` and `apps/mobile/src/ticket/TicketView/TicketView.tsx:123-131`.

The Markdown renderer supports headings, lists, task lists, links, code, fenced code, tables, quotes, and images. Task boxes are read-only checkboxes. Evidence: `apps/mobile/src/ticket/Markdown/Markdown.tsx:16-58` and `apps/mobile/src/ticket/Markdown/markdownStyles.ts:9-82`.

Inline images under 3 MiB open in a full-screen viewer. Larger images and other files open outside the app. Evidence: `apps/mobile/src/ticket/Attachments/attachmentView.ts:3-12`.

The timeline groups consecutive activity by one actor inside five minutes. A grouped row expands to its individual activity lines. Evidence: `apps/mobile/src/ticket/Timeline/timelineRows.ts:4-56` and `apps/mobile/src/ticket/Timeline/components/ActivityRow/ActivityRow.tsx:34-64`.

### Settings

Settings shows the saved name, server, theme, app version, install command, and notification placeholder. The Server row opens Setup. The theme options are System, Light, and Dark. Evidence: `apps/mobile/app/(settings)/settings.tsx:14-48`.

The install action copies `trellis install`. The screen shows no copied confirmation. Notifications show the static text `Notifications: not yet`. Evidence: `apps/mobile/app/(settings)/settings.tsx:42-46`.

## Modal, sheet, and menu inventory

| Surface | Kind | Open action | Close action |
| --- | --- | --- | --- |
| Status | Bottom sheet | Status cell | Select, scrim, or system back |
| Priority | Bottom sheet | Priority cell | Select, scrim, or system back |
| Send back | Bottom sheet | Send back | Cancel, Confirm, scrim, or system back |
| Image viewer | Full-screen modal | Inline image | Any image-area tap, Close, or system back |
| QR scanner | Inline setup state | Scan QR code | Cancel scan or successful scan |

The feature has no menu component, context menu, overflow menu, alert dialog, or confirmation dialog. `Sheet` supplies the three bottom sheets. `ImageViewer` supplies the only full-screen modal. Evidence: `apps/mobile/src/components/Sheet/Sheet.tsx:35-68` and `apps/mobile/src/ticket/Attachments/components/ImageViewer/ImageViewer.tsx:36-59`.

## Shared component inventory

| Component | Purpose |
| --- | --- |
| ActorChip | Human, agent, or system identity |
| Button | Primary or secondary form action |
| CheckRibbon | Compact CI state |
| Chip | Static compact label |
| EmptyState | Empty or error message |
| Field | Labeled text input |
| KeyValueRow | Settings and probe facts |
| PriorityIcon | Priority mark |
| RadioRow | Sheet choice |
| Row | Shared list row |
| ScreenHeader | Safe-area title and Back |
| SectionHeader | Ticket section label and count |
| Segmented | Radio-like compact selection |
| Sheet | Bottom modal |
| StatusIcon | Status category mark |
| TicketRow | Ticket list row |
| UnreachableServer | Server recovery state |

The feature uses its own native components. It does not use `packages/ui`, because the architecture allows only web to import that package.

## Tokens and visual system

`apps/mobile/src/theme/tokens.ts` is generated from `packages/ui/src/tokens.css`. It supplies both palettes, type sizes, line heights, spacing, radii, and a mono font. Evidence: `apps/mobile/scripts/generate-tokens.ts:4-9` and `apps/mobile/src/theme/tokens.ts:1-69`.

`apps/mobile/src/theme/layout.ts` supplies native dimensions. The minimum shared hit area is 44 px. Project rows are 44 px, ticket rows are 64 px, and activity rows are 32 px. Evidence: `apps/mobile/src/theme/layout.ts:1-22`.

The generated theme has no raw color use in product TSX. The only raw color outside generated tokens is the generator output for white text on saturated fills.

Measured WCAG contrast ratios:

| Pair | Light | Dark |
| --- | ---: | ---: |
| Foreground on background | 20.14:1 | 16.46:1 |
| Muted on background | 5.89:1 | 10.53:1 |
| Faint on background | 5.00:1 | 6.19:1 |
| Accent on surface | 4.74:1 | 10.82:1 |
| Text on accent | 5.07:1 | 11.35:1 |
| Danger on danger-soft | 4.69:1 | 5.67:1 |
| Warning on warning-soft | 4.67:1 | 9.92:1 |

The measured text pairs meet a 4.5:1 threshold. The calculation used the WCAG relative-luminance formula against the generated hexadecimal values.

## Retained state and data flow

The SQLite key-value store retains:

- Server URL.
- Actor name.
- Theme choice.
- Query cache.
- Recent searches.

Evidence: `apps/mobile/src/lib/keys.ts:1-8`, `apps/mobile/src/lib/store.ts:1-10`, and `apps/mobile/src/features/search/recentSearches/recentSearches.ts:1-29`.

The query cache persists at most 5 MiB and expires after one day. A one-second window coalesces writes. Evidence: `apps/mobile/src/lib/storage.ts:17-21` and `apps/mobile/src/lib/storage.ts:47-74`.

The app opens an SSE connection only in the foreground. It closes the stream in the background. It reconnects with the last event ID and invalidates all queries after a foreground return. Evidence: `apps/mobile/src/lib/live.ts:28-39` and `apps/mobile/src/lib/live.ts:89-106`.

A fresh theme choice defaults to Dark, even though the app manifest permits automatic system appearance. Evidence: `apps/mobile/src/theme/useTheme.ts:16-26` and `apps/mobile/app.json:5-9`.

The app does not retain the search field, navigation stacks, project filter, project sort, open sheets, or image-viewer state.

## Baseline findings

### 1. Rendered proof has no supported path on this Boxd host

The iOS and Android bundles export successfully. The Linux machine has no `xcrun`, `adb`, or Android `emulator` command. It has no browser binary.

The web export is not a supported substitute. The tracked app omits `react-native-web`. A temporary no-save install passed that boundary, but Expo then failed on the missing `expo-sqlite` web WASM file.

No screenshot can establish native layout, touch, text scaling, keyboard behavior, focus, safe areas, camera behavior, or device state. Native device capture remains required.

### 2. The automated surface is one data-order test

The only test checks that ticket results precede Page results. Evidence: `apps/mobile/src/features/search/SearchResults/searchRows.test.ts:1-13`.

No automated check renders a route, component, sheet, error, mutation, navigation path, or retained state. Device journeys have no automated baseline in this package.

### 3. Several loading states are blank

The app renders nothing while the mono font loads. Projects renders nothing while its query loads. Search renders nothing during a request. A project header stays empty until its query returns.

Evidence: `apps/mobile/app/_layout.tsx:69`, `apps/mobile/app/(projects)/projects.tsx:11`, `apps/mobile/app/(search)/search.tsx:100`, and `apps/mobile/app/(projects)/project/[ref].tsx:6-14`.

Ticket detail is the only route with a visible loading indicator. Evidence: `apps/mobile/app/(search,projects,settings)/ticket/[identifier].tsx:30-34`.

### 4. Page search results are visible but inert

Search can return Pages. A Page row has no action. `Row` marks a row without `onPress` as inaccessible and non-interactive.

Evidence: `apps/mobile/src/features/search/SearchResults/SearchResults.tsx:19-24`, `apps/mobile/src/features/search/SearchResults/components/PageRow/PageRow.tsx:11-24`, and `apps/mobile/src/components/Row/Row.tsx:47-56`.

### 5. Two interactive rows miss the 44 px mobile target

A recent-search row has a 36 px minimum height. An expandable timeline row has a fixed 32 px height.

Evidence: `apps/mobile/app/(search)/search.tsx:22-25`, `apps/mobile/src/theme/tokens.ts:62-64`, `apps/mobile/src/theme/layout.ts:9-12`, and `apps/mobile/src/ticket/Timeline/components/ActivityRow/ActivityRow.tsx:15-24`.

### 6. Fixed rows can truncate enlarged text

Project rows, ticket rows, and activity rows use fixed heights. Main row titles also use one line. Settings values, Page summaries, ticket titles, branches, filenames, and headers use truncation.

Evidence: `apps/mobile/src/theme/layout.ts:4-13`, `apps/mobile/src/components/Row/Row.tsx:57-71`, and `apps/mobile/src/features/projects/ProjectTree/components/ProjectRow/ProjectRow.tsx:13-46`.

This source creates a text-scaling risk at 200 percent. A native device must prove the actual result.

### 7. Dynamic status lacks announcement semantics

Setup errors, probe results, mutation failures, stale-description text, and copied state do not use a live region. The copy action has no success text.

Evidence: `apps/mobile/app/setup.tsx:153-174`, `apps/mobile/src/ticket/TicketView/TicketView.tsx:123-130`, `apps/mobile/src/ticket/Description/Description.tsx:18-26`, and `apps/mobile/app/(settings)/settings.tsx:43-46`.

### 8. Bottom sheets lack modal and focus semantics in source

`Sheet` uses a React Native `Modal`, but it sets no `accessibilityViewIsModal`. Its title is plain text. It records no focus entry or return behavior. A Close button wraps the panel and its controls.

Evidence: `apps/mobile/src/components/Sheet/Sheet.tsx:35-66`.

A native screen reader must verify the practical reading order and focus behavior.

### 9. Keyboard focus has no visual state

No mobile source uses `onFocus`, `onBlur`, `focusable`, or a focus style. Pressable controls define pressed and sometimes disabled states.

The system can provide native focus behavior, but the source has no app-level focus treatment. Keyboard and switch-control proof remains open.

### 10. Reduced motion is not connected

The app defines `useReduceMotion`, but no component imports it. Bottom sheets always use a slide animation. The image viewer always uses a fade animation.

Evidence: `apps/mobile/src/hooks/useReduceMotion/useReduceMotion.ts:1-20`, `apps/mobile/src/components/Sheet/Sheet.tsx:44`, and `apps/mobile/src/ticket/Attachments/components/ImageViewer/ImageViewer.tsx:42`.

### 11. Camera denial has no direct recovery action

The denied camera state tells the user to open the Settings app. It offers only Cancel scan. It does not call `Linking.openSettings`.

Evidence: `apps/mobile/src/features/setup/QrScanner/QrScanner.tsx:35-54`.

### 12. Expo reports dependency compatibility drift

`expo install --check` reports incompatible expected versions for 13 packages:

- `@shopify/flash-list`
- `expo`
- `expo-camera`
- `expo-clipboard`
- `expo-constants`
- `expo-font`
- `expo-haptics`
- `expo-image`
- `expo-linking`
- `expo-router`
- `expo-sqlite`
- `react`
- `react-dom`

The check exits 1. Bundle exports still pass. This report does not change versions.

## Positive controls

- Shared buttons expose button roles, names, and disabled state. Evidence: `apps/mobile/src/components/Button/Button.tsx:27-49`.
- Segmented controls expose a radio group and checked radio state. Evidence: `apps/mobile/src/components/Segmented/Segmented.tsx:20-42`.
- Status and priority marks have non-color shapes. Evidence: `apps/mobile/src/components/StatusIcon/StatusIcon.tsx:36-67` and `apps/mobile/src/components/PriorityIcon/PriorityIcon.tsx:29-58`.
- The shared header includes the top safe-area inset. Evidence: `apps/mobile/src/components/ScreenHeader/ScreenHeader.tsx:29-48`.
- The sheet includes the bottom safe-area inset and a keyboard avoidance view. Evidence: `apps/mobile/src/components/Sheet/Sheet.tsx:35-66`.
- Search, project tickets, and timeline use virtualized FlashList surfaces.
- Server replacement clears the previous server query cache.
- Mutations use optimistic updates and version-conflict recovery.
- Light and dark text pairs meet the measured contrast threshold.
- Product TSX uses generated palette values instead of raw colors.

## Checks on Boxd

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Pass. Installed 1,448 packages. |
| `bun run --cwd apps/mobile typecheck` | Pass. |
| `bun test apps/mobile/src/features/search/SearchResults/searchRows.test.ts` | Pass. 1 test and 1 assertion. |
| `bunx biome check apps/mobile` | Pass. Checked 145 files with no fixes. |
| `cd apps/mobile && bunx expo install --check` | Fail. Thirteen dependency versions differ from Expo expectations. |
| `bun run --cwd apps/mobile export:check` | Pass. iOS bundle has 2,202 modules and a 6.2 MiB Hermes bundle. |
| `cd apps/mobile && bunx expo export --platform android --output-dir /tmp/trellis-trl1344-android` | Pass. Android bundle has 2,284 modules and a 6.4 MiB Hermes bundle. |
| `cd apps/mobile && bunx expo export --platform web --output-dir /tmp/trellis-trl1344-web` | Fail. The tracked app omits `react-native-web`. |
| Web export after a no-save install of `react-native-web@0.21.2` and `@expo/metro-runtime@57.0.15` | Fail. Expo cannot resolve `expo-sqlite/web/wa-sqlite/wa-sqlite.wasm`. |
| WCAG contrast script against `tokens.ts` | Pass for the measured text pairs. Lowest ratio is 4.67:1. |

## Explicit exclusions

- No product source changed.
- No API, server, web, desktop, CLI, or shared UI behavior changed.
- No Superset comparison appears here. The parent owns competitor evidence and the later design judgment.
- No production data or credential entered the Boxd machine.
- No Trellis server started.
- No live host, project, ticket, agent, or provider conversation supplied fixture data.
- No iOS simulator ran on Linux.
- No Android emulator ran.
- No physical device ran.
- No Mac build ran.
- No native screenshot exists.
- No 320 px native view, 200 percent text, screen reader, switch control, keyboard, camera, reduced-motion, safe-area, or rotation result is claimed.
- No pull request, merge, deployment, or installed acceptance is part of this baseline.

## Required next proof

The implementation round needs synthetic fixture data that covers every state in this report. It needs native capture on a phone or simulator for both themes.

The native proof must cover:

- Fresh setup, pair link, QR scan, permission denial, probe failure, probe success, and save.
- Search recents, pending, error, empty, mixed results, exact identifier, and Page behavior.
- Project loading, error, empty, filters, sorts, pagination, and server recovery.
- Ticket loading, errors, long Markdown, dense sub-tickets, pull requests, attachments, timeline, sheets, mutations, conflict, and send back.
- Settings, copy confirmation, server replacement, theme retention, and notification copy.
- 320 px width where the native platform supports that viewport.
- 200 percent text.
- Both themes.
- Screen reader names, order, announcements, modal focus, and return focus.
- External keyboard and visible focus.
- Reduced motion.
- Touch targets and stable layout.
- Retained URL, name, theme, cache, and recent searches.

