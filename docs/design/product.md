# trellis — Product Design Document

Written for the engineer building it. Every open question in the brief gets one answer. Where Linear has a convention, trellis copies it so nothing needs a manual; where agent-driven work differs, trellis diverges and says why.

---

## 0. Product thesis in one paragraph

Linear is built around people: assignees, cycles, teams. trellis is built around a single human dispatching work to agents and reviewing what comes back. Consequences that drive every decision below: the home screen is an inbox of things that need the human ("Needs you"), not a board; the actor on every event is either a human or an agent and the two look different everywhere; a ticket is designed to be exported as a brief that an agent can act on; PR and CI state are first-class on the card, because for agent work the PR *is* the deliverable and CI *is* the first reviewer.

---

## 1. Information architecture and routes (web)

### 1.1 Sidebar (240px, collapsible with `[`)

Top to bottom:

1. **Workspace row** — "trellis" wordmark, connection dot (green live / amber reconnecting / red down), theme toggle.
2. **Needs you** — with a count badge (Human Review + failing CI). Home.
3. **Search** — opens Cmd-K in search mode.
4. **All tickets** — table across every project.
5. **Projects** section header with `+`.
   - Root projects as rows: key badge (`CDE`) + name. Chevron to expand sub-projects.
   - Sub-projects nested, indented 16px per level, no key badge (they share the root key).
   - Row shows a muted count of open tickets (status category not in done/canceled).
   - Right-click / `…` menu: New sub-project, New ticket, Settings, Copy CLI filter (`trellis ls -p CDE/web`).
   - Tree expansion state persists in localStorage.
6. **Bottom pinned**: current actor chip (avatar initials + name + "human"), Settings gear, keyboard help `?`.

Views (Table | Board) are **not** sidebar items. They are a segmented control in the page header. The sidebar is for *where*, the header is for *how*.

### 1.2 Project tree semantics

- Root project owns the key. Tickets across the whole subtree share the root sequence (`CDE-1`, `CDE-2` …).
- Sub-projects have a URL slug (kebab-case, unique among siblings, editable in settings). Reserved slugs: `board`, `settings`, `new`, `issues`.
- Opening a project shows tickets from **the project and all its descendants** by default. The filter bar shows this as an implicit chip `in CDE/web + sub-projects`; clicking it toggles to "this project only" (`?scope=self`).
- Statuses: a sub-project inherits its nearest ancestor's status set unless it defines its own (settings shows "Inherited from CDE — Customize" button).

### 1.3 Routes

| Route | What |
|---|---|
| `/` | Redirect → `/needs-you` (or `/setup` on first run) |
| `/setup` | First-run: name, first project |
| `/needs-you` | Home inbox (section 7.5) |
| `/all` | Table across all projects |
| `/all/board` | Board across all projects, columns by **category** (since status sets differ) |
| `/p/CDE` | Project table (default view) |
| `/p/CDE/board` | Project kanban |
| `/p/CDE/web/auth` | Sub-project table; `/p/CDE/web/auth/board` for kanban |
| `/p/CDE/settings` | Statuses, sub-projects, default description, key |
| `/t/CDE-42` | Full ticket page |
| `/search?q=…` | Full search results (table component) |
| `/settings` | Actor name, theme, agent command template, GitHub/`gh` status |

Router shape: `/p/$` splat, parsed as `[key, ...slugs, viewOrNothing]`. Last segment is consumed as a view only if it is in the reserved set.

View state lives in **search params** on the list/board routes: `?status=…&priority=…&pr=…&updated=…&sort=…&group=…&q=…&scope=…&peek=CDE-42&density=compact`. Exact grammar in section 5.2.

### 1.4 How a ticket opens

Three surfaces, used deliberately:

| Surface | Trigger | URL | Why |
|---|---|---|---|
| **Side peek** (default) | Click row/card, `Enter`, `Space` | current route + `?peek=CDE-42` | Triage is the dominant loop with agent work. Peek keeps the list in view, `j`/`k` move between tickets *while the peek is open*, `Esc` closes. Browser back closes the peek because it is a search param push. |
| **Full page** | `O`, click the ID chip, Cmd-click, or the expand icon in the peek header | `/t/CDE-42` | Deep reading/editing of description, long timelines, sharing a link. Peek header has an "Open" button; full page has "Back to list" preserving the previous search params. |
| **Modal** | Never for tickets. | — | Modals lock context; the composer and destructive confirms are the only dialogs. |

Peek: 720px wide, slides in from the right over the list at 240ms; the list dims 4% and stays scrollable. Resizable via drag handle (persisted). At viewport < 1100px the peek becomes full width (still a peek: `Esc` returns).

### 1.5 Sub-tickets and parents

- **Breadcrumb** at the top of the ticket header: `CDE › web › auth  ·  CDE-12 Parent title` — project path as links, then the parent ticket as a chip (ID + truncated title, click opens parent in the same surface). Only one parent level is shown in the breadcrumb; deeper ancestry is available in the parent chip's hover card.
- **Sub-tickets section** under the description: progress bar (`3/5 done`, green fill), rows with status icon, ID, title, priority, PR/CI indicator, and an inline "Add sub-ticket" input at the bottom. Rows open in peek.
- In the **table**, sub-tickets show under their parent only when the view is unsorted/ungrouped by default (`group=parent` is an available grouping). Otherwise they appear as flat rows with a `↳ CDE-12` muted chip after the title. Deciding against always-nested because agents create sub-tickets liberally and a flat, filterable list is what the human actually scans.
- On the **board**, a card with sub-tickets shows `2/5` with a mini ring; sub-tickets are their own cards.

---

## 2. The ticket page

### 2.1 Layout

Full page: two columns. Main column max 760px, left-aligned with 48px gutter. Properties rail 280px on the right, sticky. Peek: same content, but the rail collapses into a **property grid** (2 columns of label/value) placed directly under the title, then the main content.

Top to bottom, main column:

1. **Header bar** (sticky): breadcrumb (1.5), then right-aligned actions: `Start with agent ▾`, `Copy ID`, `…` menu (Copy brief, Copy branch name, Copy link, Move to project, Set parent, Delete), and in peek: expand, close.
2. **ID + title**: `CDE-42` in muted tabular numerals above a 24px semibold title. Title is a contenteditable single-line field; saves on blur/Enter, `Esc` reverts.
3. **Description**: Tiptap 3 editor, markdown in/out. Placeholder: "Describe the work. Agents read this verbatim." Renders as markdown with GFM (task lists, tables, fenced code with highlighting). Editing is direct (click to place caret); no edit/preview mode toggle. Saves 800ms after last keystroke and on blur; a tiny "Saved" state in the rail. Slash menu (`/`) for headings, code block, task list, image (uploads as attachment).
4. **Sub-tickets** (only rendered if any exist or the user clicks "Add sub-ticket" from the rail).
5. **Pull requests** (2.3).
6. **Attachments** (2.4).
7. **Timeline** — comments and activity interleaved (2.5), with the comment composer pinned at the bottom.

### 2.2 Properties rail

Ordered, each row = 13px muted label on the left, value control on the right. All values are popover pickers (same components used in table inline edit and Cmd-K).

| Row | Control | Notes |
|---|---|---|
| Status | Status picker, grouped by category, type-to-filter | Shortcut `s` |
| Priority | Priority picker with Linear bars | Shortcut `p` |
| Project | Tree picker (project path) | Changing project across roots renumbers: **disallowed** — ticket can only move within its root tree. Show why in the picker. |
| Parent | Ticket search picker; "None" clears | `Shift+P` |
| Sub-tickets | Count + "Add" | |
| Branch | `cde-42-short-slug` with copy button | Computed, not stored; slug from the title at creation, stable afterwards (stored `branch_slug`) |
| Created | `2h ago by ○ Navid` | Actor rendering per 2.6 |
| Updated | `4m ago by ⟡ claude · agent` | |
| Labels | **Not in v1.** | Project tree + priority + status categories cover a solo workflow; labels invite inconsistent agent-created taxonomies. Revisit only if demanded. |

### 2.3 Pull requests

Linked by the agent via CLI (`trellis pr add CDE-42 https://github.com/o/r/pull/123`) or by pasting a PR URL into the "Link PR" input in this section. The server also auto-links: a PR whose branch name or title contains `CDE-42` is attached when discovered via `gh pr list` in configured repos.

**PR row** (56px, comfortable):

```
[state icon]  o/r #123  Add OAuth callback handling            [check ribbon]  [✓ 12 · ✕ 1 · ○ 2]  [↗]
              feature/cde-42-oauth → main · updated 3m ago · by claude · agent
```

- State icon (lucide `GitPullRequest` family): open = green, draft = gray with dashed outline, merged = violet `GitMerge`, closed = red `GitPullRequestClosed`.
- **Check ribbon**: a 64×6px segmented bar, one segment per check, in run order; green pass, red fail, gray pending (animated shimmer), amber skipped/neutral. This is the signature detail (9.7) — it reads at a glance and looks distinctive in screenshots.
- Summary pill: counts with icons. Overall color = red if any fail, amber if any pending, green if all pass, gray if no checks. Pill text when zero checks: "No checks".
- Review state (if any): `Approved` / `Changes requested` small chip.
- Row expands (click or `Enter`) to **per-check rows**: status icon, check name (e.g. `test (ubuntu, node 22)`), duration, and an "Open" link to the check's details URL. Failing checks sort first. Expanded state remembered per PR in session.
- `↗` opens the PR on GitHub. Cmd-K also lists "Open PR #123".
- Merged PR on a ticket in a `review` status shows an inline nudge under the row: "PR merged — Mark Done?" with a button. No auto-transition in v1; the human decides.

**Freshness**: server refreshes open PRs every 60s via `gh` (only for tickets not done/canceled), on demand via the ↻ button in the section header, and pushes updates over SSE. "Fetched 40s ago" text in the section header. If `gh` is missing or unauthenticated, the section shows an inline setup notice with the exact command (`gh auth login`).

### 2.4 Attachments

- **Drop zone**: the whole ticket page is a drop target; on dragover a full-surface dashed overlay says "Drop to attach to CDE-42". The Attachments section also has an explicit dashed box with "Drop files or click to upload".
- Pasting an image into the description or a comment uploads it as an attachment and inserts `![name](/files/<id>)` in the markdown.
- Rendering: images as a 96px-square thumbnail grid (click opens a lightbox with arrow-key navigation); non-images as rows: file icon by type, name, size, uploaded by/when, download. `…` menu: Copy markdown link, Rename, Delete.
- Stored on disk under the server data dir, served at `/files/:id/:filename` (so agents can `curl` them from the brief).

### 2.5 Timeline: interleaved

**Decision: one interleaved timeline, oldest first, comment composer pinned at the bottom.** A toggle in the section header switches "All | Comments". Interleaving wins because an agent's status transitions between its comments are the narrative ("moved to In Progress → commented plan → linked PR → moved to Agent Review"); a split view hides that.

Rules:

- **Comment** = full card: actor line, relative time (hover: absolute), markdown body, `…` menu (Edit, Copy markdown, Delete). Editing inline with Tiptap. Comment composer: Tiptap, `Cmd+Enter` to post, supports drag/paste attachments.
- **Activity** = single 32px line: actor, verb, from → to, time. Examples: `⟡ claude · agent moved Todo → In Progress · 2h`, `○ Navid set priority High · 1d`, `⟡ claude · agent linked PR #123`.
- **Collapsing**: consecutive activity by the same actor within 5 minutes collapses into one row: `⟡ claude · agent changed status, priority, and linked a PR · 2h` — expandable.
- Comments by agents get a left border in the agent accent color; human comments get the neutral border. This keeps "who said what" legible when scrolling fast.

### 2.6 Rendering "who": human vs agent

| | Human | Agent |
|---|---|---|
| Avatar | Filled circle, initials, neutral color derived from name hash | Rounded-square outline in agent accent (violet) with lucide `Bot` glyph |
| Name | `Navid` in UI font, medium weight | `claude` in monospace inside a chip: `⟡ claude · agent`; the `· agent` suffix in muted |
| Where the chip appears | Everywhere an actor is shown | Everywhere an actor is shown; on board cards and table rows the *last-touched-by* actor is shown as a 16px avatar only, with the chip on hover |
| Live dot | none | If the agent produced any event in the last 5 minutes, a small pulsing dot on the avatar ("live agent dot", 9.7). The pulse respects reduced motion (static dot). |

Actor name + kind are the only stored identity fields; there is no profile page. Clicking an actor chip applies a filter `actor=claude` in the current list.

---

## 3. Table view

Built on TanStack Table v9 + TanStack Virtual; row virtualization always on.

### 3.1 Columns

| Column | Default | Width | Content |
|---|---|---|---|
| Select | visible (checkbox appears on hover / when any selected) | 32 | |
| Priority | visible | 32 | Bars icon; click → popover |
| ID | visible | 72 | `CDE-42` tabular numerals, muted; click opens full page |
| Title | visible, flexible | fill | Title; inline muted chips after it: `↳ CDE-12` (parent), sub-ticket ring `2/5`, paperclip + count, comment count |
| Status | visible | 140 | Category icon + name; click → popover |
| PR | visible | 96 | PR state icon + mini check ribbon (or summary dot when compact); hover card lists PRs with counts |
| Project | visible only when scope includes sub-projects | 140 | Sub-path relative to the viewed project (`web/auth`) |
| Last actor | visible | 40 | 16px avatar (human circle / agent square) |
| Updated | visible | 80 | Relative, tabular |
| Created | hidden | 80 | |
| Parent | hidden | 120 | |
| Sub-tickets | hidden | 64 | |

Column visibility, order, density, grouping, and sort live in the **Display** popover (button at the right end of the filter bar, Linear-style). Column visibility and density are UI preferences (localStorage per route); sort and group are URL state.

### 3.2 Default sort and grouping

- Default: **group by status** (in category order, then configured status order), rows sorted by **priority desc, then updated desc**. Group headers show the status icon, name, count, and a `+` to create a ticket in that status.
- Done and Canceled groups are collapsed by default with a "Show 34" affordance. Group collapse persists per route in localStorage.
- Sort options: Priority, Updated, Created, Status, ID, Title. Group options: None, Status, Priority, Project, Parent, PR state.

### 3.3 Density

`comfortable` (40px rows, 13px text) default; `compact` (32px rows, 12px text). Toggle in Display; `?density=compact` in URL only when explicitly set (so shared links preserve it).

### 3.4 Inline edits

- Status and Priority cells open a popover on click or via `s`/`p` on the focused row. Popovers are the same component as the rail and Cmd-K: searchable list, category icons, `Enter` applies, `Esc` cancels. Applied optimistically (10.3).
- Project cell → tree picker. Parent cell → ticket picker.
- Title is **not** edited inline in the table; `Enter` opens the peek where the title is editable. Reason: accidental edits during fast keyboard nav.

### 3.5 Multi-select and bulk actions

- `x` toggles selection on the focused row; `Shift+click` / `Shift+j/k` extends; `Cmd+A` selects all rows in the current filter (virtual-safe: selection is by ID set); `Esc` clears.
- Selected rows: accent left border + tinted background. Checkbox column becomes always visible once one is selected.
- **Bulk bar**: floats bottom-center, 480px, slides up 180ms. Shows `12 selected` and buttons: Status, Priority, Move to project, Set parent, Copy IDs, Delete (confirm). Every bulk change writes one activity entry per ticket with the current actor.
- Cmd-K with a selection shows "12 tickets" context actions at the top.

### 3.6 Keyboard navigation (table)

Roving focus on rows; the focused row has a 2px inset accent ring on the left edge and a subtle background.

| Key | Action |
|---|---|
| `j` / `k` or `↓` / `↑` | Move focus |
| `Enter` / `Space` | Open peek |
| `o` | Open full page |
| `x` | Toggle select |
| `Shift+j/k` | Extend selection |
| `s` / `p` | Status / priority popover for focused (or selected) rows |
| `Shift+P` | Parent picker |
| `m` | Move to project |
| `c` | New ticket (composer) |
| `Cmd+C` | Copy ID of focused row |
| `Cmd+Shift+C` | Copy branch name |
| `Cmd+.` | Copy link |
| `Backspace` / `Delete` | Delete (confirm) |
| `Esc` | Close peek → clear selection → blur |
| `g` then `s` | Focus filter bar |
| `1`–`9` | Toggle group collapse for the nth group |

### 3.7 Row count and empty states

- Footer bar (28px, muted): `42 tickets · 3 selected` and the active sort as text. Group headers show per-group counts.
- **No tickets in project**: illustration-free empty state with a title, a "Create ticket" button, and a copyable CLI line: `trellis create -p CDE -t "First ticket"`.
- **No results for filters**: "No tickets match. [Clear filters]". If `q` is set: "No tickets match 'oauth'".
- **Server unreachable**: handled globally (10.4), not per-table.

---

## 4. Kanban

Built on Atlassian pragmatic-drag-and-drop with the hitbox and auto-scroll addons.

### 4.1 Columns

- One column per status in the viewed project's effective status set, ordered by category (`todo → started → review → done → canceled`) then configured order within a category.
- `/all/board` and any view spanning multiple status sets use **category columns** (5 fixed) with a per-card status name in the footer.
- Header: category icon, status name, count, WIP limit badge if set, `+` (add), `…` (collapse, set WIP limit, hide done older than…). Header turns amber and the count reads `7/5` when a WIP limit is exceeded. WIP limits are per-status settings, off by default.
- Done column shows tickets completed in the last **14 days** by default with a footer link "Show all done". Canceled column is **collapsed by default**.
- Collapsed column: 40px wide, vertical label + count; click to expand. Collapsed state is a UI preference in localStorage per project (not URL) because it is a personal layout choice, not a view definition.
- Horizontal scroll with column snapping; column width 300px; column body virtualized when > 100 cards.

### 4.2 Card

```
CDE-42                                   [!! priority]
Add OAuth callback handling for GitHub
login (2 lines max, then ellipsis)
[PR ○ ▮▮▮▮▮▯▯] [2/5]  [📎 1]        ⟡ · 4m
```

- Row 1: ID in muted tabular numerals; priority icon right-aligned (none priority renders nothing, not the dashes, to keep cards quiet).
- Row 2–3: title, 13px, two-line clamp.
- Footer: PR state icon + mini check ribbon (only if a PR exists), sub-ticket ring with `2/5`, attachment count; right side: last actor avatar (16px) and relative time.
- A card whose open PR has a **failing check** gets a 2px red top border. This is the "PR failing CI surfaced on the card" requirement; it is also the only time a card uses a colored border.
- Hover: elevate 1 step (shadow token), no scale. Focused card: accent ring.

### 4.3 Drag rules

- Drag a card between columns = status change with the current human actor; optimistic; the activity entry reads `○ Navid moved In Progress → Human Review`.
- A column takes no manual order. It lists the ticket that changed last at the top, and it breaks a tie by id descending. A drop inside the card's own column changes nothing, and the column shows no drop indicator.
- Drop indicator: a 2px accent line above the first card of the column the pointer enters, because the card lands there; the target column gets a 4% tint. The dragged card renders as a lightweight preview (title + ID only) at 0.9 opacity; the source slot shows a dashed placeholder.
- Dropping onto a collapsed column is allowed (column expands on hover after 400ms).
- Category columns on `/all/board`: dropping picks the **first** status of that category in the ticket's project; if there are multiple, a small popover asks which.
- Multi-drag: not in v1. Bulk status changes are done from the table.

### 4.4 Adding a ticket from a column

`+` in the column header and the ghost "+ New ticket" row at the bottom both open the full composer. The composer takes the project of the page and the status of the column. `c` opens the same composer. The board creates no ticket from a field on the column.

### 4.5 Keyboard on the board

Arrow keys move focus across cards and columns; `Enter` peek; `s` opens the status popover (this is the accessible equivalent of dragging); `[`/`]` move the focused card to the previous/next column (status change).

---

## 5. Filters, sort, group, search, Cmd-K, shortcuts

### 5.1 Filter bar model

Linear-style chips under the page header. `F` or the "Filter" button opens a picker (cmdk list) of fields; picking a field opens its value picker; the chip renders as `Status is In Progress, Agent Review`. Clicking the chip's operator toggles `is` ⇄ `is not`; clicking the value reopens the picker; `×` removes.

| Field | Operators | Values |
|---|---|---|
| Status | is / is not | statuses of the scope, plus category pseudo-values `@todo @started @review @done @canceled` |
| Priority | is / is not | none, urgent, high, medium, low |
| Project | is / is not | any project path; each chip has a "+ sub-projects" toggle |
| Parent | is / has parent / no parent | ticket |
| PR | has / none / open / draft / merged / passing / failing / pending | |
| Updated | after | `1h 24h 7d 30d` or a date |
| Created | after / before | same |
| Actor | last updated by | actor name, or kind `@agent` / `@human` |

Multiple chips AND together; multiple values within a chip OR together (same as Linear). Presets in the filter picker's first section: **Active** (status not done/canceled), **Needs review** (status @review), **Failing CI** (pr=failing), **Touched by agents today** (actor=@agent, updated>24h).

### 5.2 URL serialization

One param per field; comma-separated values; a leading `!` negates the whole set. Values are status **slugs** (not ids) so URLs are readable and stable across renames only if slug unchanged (slug is editable but warned).

```
/p/CDE?status=in-progress,agent-review&priority=!none&pr=failing&updated=7d&actor=@agent&sort=-updated,priority&group=status&scope=self&q=oauth&peek=CDE-42
```

- `sort`: comma list, `-` prefix = desc. `group`: one field or absent.
- Absent params = defaults. The app never writes default values into the URL, so `/p/CDE` stays clean.
- The whole bar has a "Copy link" and a "Copy as CLI" action that emits the equivalent `trellis ls -p CDE --status in-progress,agent-review --pr failing --updated 7d`. Same grammar on both sides by design.

### 5.3 Saved views

**Not in v1.** URLs are the saved view; the browser bookmarks them, and the CLI accepts the same filters. Adding saved views later is additive (a sidebar section) and does not change the URL model. The four presets above cover the common cases.

### 5.4 Full-text search

- Backend: Postgres `tsvector` in PGlite over title (weight A), description (B), comments (C); plus trigram-free prefix matching on ID.
- Ranking: exact ID match first; then title prefix/phrase matches; then `ts_rank_cd` with weights; tie-break `updated desc`. Done/canceled tickets are ranked after active ones with equal score, never excluded.
- Cmd-K shows the top 6 as you type (debounced 80ms); `Enter` opens the peek; `Cmd+Enter` opens `/search?q=` with the full table (filters apply on top of search).
- Typing `CDE-42` anywhere in the palette jumps straight to that ticket.

### 5.5 Cmd-K palette (cmdk)

Sections in order, contextual to where you are:

1. **This ticket** (when a ticket is open in peek/full page, or a row is focused): Change status… (submenu), Set priority…, Move to project…, Set parent…, Add sub-ticket, Start with agent (copies command), Copy ID `CDE-42`, Copy branch name, Copy agent brief, Copy link, Open PR #123 (one per PR), Open full page, Delete.
2. **Selection** (when rows are selected): the bulk actions.
3. **Create**: New ticket, New sub-ticket (when a ticket is open), New project, New sub-project (in a project).
4. **Go to**: Needs you, All tickets, each project (fuzzy), Board / Table of current project, Settings.
5. **View**: Filter by…, Sort by…, Group by…, Toggle density, Toggle theme, Collapse sidebar.
6. **Search results**: tickets matching the query (5.4).

Each item shows its shortcut on the right. Actions on tickets write activity with the current actor.

### 5.6 Global keyboard shortcut map

| Key | Action | Scope |
|---|---|---|
| `Cmd+K` | Command palette | global |
| `/` | Focus search (palette in search mode) | global |
| `c` | New ticket | global |
| `?` | Shortcut help sheet | global |
| `g` `h` | Go to Needs you | global |
| `g` `a` | Go to All tickets | global |
| `g` `p` | Go to project… (picker) | global |
| `g` `b` / `g` `t` | Switch to Board / Table | project routes |
| `g` `s` | Focus filter bar | list routes |
| `[` | Toggle sidebar | global |
| `Cmd+\` | Toggle theme | global |
| `Esc` | Close popover → close peek → clear selection | global |
| `j` `k` `↑` `↓` | Move focus / next-prev ticket in peek | list, board, peek |
| `Enter` / `Space` | Open peek | list, board |
| `o` | Open full page | list, board, peek |
| `x` | Toggle select | list |
| `Shift+j/k` | Extend selection / reorder in column | list / board |
| `s` | Status picker | list, board, ticket |
| `p` | Priority picker | list, board, ticket |
| `Shift+P` | Parent picker | list, board, ticket |
| `m` | Move to project | list, board, ticket |
| `[` / `]` (card focused) | Move to previous / next column | board |
| `a` | Approve (→ Done) | Needs you, review-status tickets |
| `r` | Send back (→ started status, with comment) | Needs you, review-status tickets |
| `e` | Edit description (focus editor) | ticket |
| `Shift+C` | Focus comment composer | ticket |
| `Cmd+Enter` | Submit composer / post comment | dialogs, editors |
| `Cmd+Shift+Enter` | Create and start another | composer |
| `Cmd+C` | Copy ID | list, board, ticket |
| `Cmd+Shift+C` | Copy branch name | list, board, ticket |
| `Cmd+.` | Copy link | list, board, ticket |
| `Cmd+Shift+A` | Start with agent (copy command) | ticket |
| `Cmd+Shift+B` | Copy agent brief | ticket |
| `Backspace` | Delete (confirm) | list, board |
| `1`–`9` | Toggle nth group / column collapse | list / board |

`Cmd` is `Ctrl` on Linux/Windows. Sequences (`g h`) have a 800ms window and show a small "g…" hint bottom-left.

---

## 6. Create ticket flow

### 6.1 Quick composer

- Opened by `c`, the sidebar `+`, group/column `+`, or Cmd-K. Centered dialog, 640px wide, no backdrop blur (blur is slow and looks cheap); backdrop at 40% scrim.
- Fields: title (autofocus, single line, 16px), description (Tiptap, pre-filled with the project's default description if set, section 6.3), then a **property chip row**: Project, Status, Priority, Parent — each a popover, each showing its current value. The chip row mirrors the rail so nothing new is learned.
- `Cmd+Enter` creates and closes; `Cmd+Shift+Enter` creates and keeps the dialog open with the same properties (a toast "Created CDE-43 — Open" appears each time); `Esc` closes (asks to discard only if the title or description is non-empty).
- After creation, the row/card animates into its list position; the toast's "Open" opens the peek.
- Draft persistence: the composer body is kept in sessionStorage until created or explicitly discarded, so an accidental `Esc` loses nothing.

### 6.2 Defaults from the current view

- Project = the viewed project (or the top-level project when on `/all`, with the chip requiring a choice before submit).
- Status = if the active filter has `status is <single value>`, that status; else the project's default status (first `todo`-category status). When opened from a group header or column `+`, that group's status.
- Priority = single-valued `priority is` filter, else none.
- Parent = when opened from a ticket ("Add sub-ticket", `Shift+C` in the sub-tickets section, Cmd-K "New sub-ticket"), the current ticket; the project chip is locked to the parent's project.

### 6.3 Templates

**No template system in v1.** One optional per-project **default description** (markdown, editable in project settings) is pre-filled into new tickets. Ship a sensible default:

```
## Context

## Acceptance criteria
- [ ]

## Out of scope
```

This is what agents need to do good work and what the human needs to review it. A template picker would add a menu for nothing at this scale.

---

## 7. Actor identity and the agent-facing product

### 7.1 First-run prompt

`/setup`, step 1: "What should we call you?" — single text field, `Continue`. Stored in localStorage (`trellis.actor = { name, kind: 'human' }`) and sent as the `X-Trellis-Actor` and `X-Trellis-Actor-Kind` headers on every mutation. Step 2 creates the first project (10.1). The CLI, separately, takes `--as <name>` / `--kind agent|human`, or `TRELLIS_ACTOR` / `TRELLIS_ACTOR_KIND` env vars, defaulting to `$USER` / `human`. Agent setups are expected to export `TRELLIS_ACTOR=claude TRELLIS_ACTOR_KIND=agent` in their environment, and the brief tells them to.

### 7.2 How the current actor shows in the UI

Bottom of the sidebar: avatar + name + `human` in muted. Click → rename popover. Every mutation the web app makes is attributed to this actor; nothing else is asked of the user.

### 7.3 Agents in activity

`⟡ claude · agent` chip (2.6). Multiple agents with different names (`claude`, `codex`, `cursor`) get different hash colors within the violet family so they remain distinguishable but clearly not human.

### 7.4 Agent affordances (what makes this not-Linear)

**Start with agent** (primary button on every ticket, `Cmd+Shift+A`): copies a shell command to the clipboard and toasts "Copied — paste in your terminal". Default template, configurable in Settings → Agents:

```
claude "$(trellis brief CDE-42)"
```

Dropdown next to the button: Copy command · Copy prompt only (the brief text) · Copy brief as markdown · Copy `trellis` CLI cheat-sheet. Starting an agent also moves the ticket to the first `started` status *only if* the human confirms via a checkbox in the dropdown ("also mark In Progress"), remembered.

**Agent brief** (`trellis brief CDE-42`, and "Copy brief"): a markdown document, deterministic layout so agents can parse it:

1. Header: `# CDE-42 — Title`, project path, status, priority, parent (with title), branch name, links to the ticket URL.
2. Description verbatim.
3. Sub-tickets with status (if any).
4. Linked PRs with state and failing check names (if any).
5. Attachments as URLs.
6. Last 10 comments, newest last, with actor and kind.
7. **Protocol section** (fixed text): how to move status (`trellis status CDE-42 in-progress`), comment (`trellis comment CDE-42 "…"`), link PR (`trellis pr add CDE-42 <url>`), create sub-tickets, and the expectation: "When your work is ready for review, set status `agent-review`. Do not set `done`."

**Status categories as workflow**: default set `Todo → In Progress → Agent Review → Human Review → Done`. Each `review`-category status has a `reviewer` attribute (`agent` | `human`; Agent Review = agent, Human Review = human). This attribute is what powers "Needs you" across custom status sets, and the CLI refuses `trellis status X done` from an agent actor unless `--force` (exit code 3, stderr: "agents cannot mark Done; set human-review instead").

**Approve / Send back**: on any ticket in a human-reviewer status, the header shows two buttons: **Approve** (→ first `done` status, `a`) and **Send back** (→ first `started` status, `r`, opens a comment box first: "What should change?"). Both write activity, and Send back posts the comment. The same pair is on Needs you rows and the mobile app.

**CI on the card**: red top border + ribbon (4.2). Failing CI on an open PR also appears in Needs you.

### 7.5 "Needs you" home screen

Route `/needs-you`. Header: greeting-free, just "Needs you" and a live count. Sections, each a compact table (same row component as the table view, comfortable density, no grouping), collapsible, with count in the header:

1. **Review** — tickets in a human-reviewer status, sorted by time-in-status desc (oldest waiting first). Each row has Approve / Send back / Open PR actions on hover and via `a` / `r`. Approving animates the row out (9.6) and decrements the count.
2. **Failing CI** — tickets not done/canceled with an open PR whose checks include a failure. Row shows the PR, failing check names, and "Re-run with agent" which is the Start-with-agent command with an appended instruction (`… fix the failing checks: test (node 22)`).
3. **Stalled** — tickets in a `started` status with no activity for 24h (configurable). Likely a dead agent session. Actions: Start with agent, Move to Todo.
4. **Done by agents today** — collapsed by default. Awareness of what landed without human input; each row has "Reopen".

Empty state when all sections are empty: a single quiet line — "Nothing needs you. 3 tickets in progress by agents." with a link to the Active preset. This screen is the first thing the user sees and the screenshot people share.

---

## 8. Mobile app (Expo)

### 8.1 Navigation

Bottom tabs: **Needs you** (home) · **Search** · **Projects** · **Settings**. Stack navigation within each tab; ticket screen is a stack push (never a modal) with the ID as the header title.

### 8.2 Screens

| Screen | Content | Editable |
|---|---|---|
| Server setup | URL field with `http://` default, "Test connection" (calls `GET /health` → shows server name, version, ticket count), name field, Save. Shown until both are set. Reachable later from Settings → Server. | — |
| Needs you | The four sections from 7.5 as a sectioned list. Rows: status icon, ID, title, PR/CI ribbon, time waiting. Swipe right on a Review row = Approve (green), swipe left = Send back (opens comment sheet). Pull to refresh. | Approve, Send back |
| Search | Search field, recent searches, results list | — |
| Projects | Tree as an indented list; tap → project ticket list with a status segmented filter (Active / Review / Done) and a sort toggle. No board on mobile. | — |
| Ticket | Title, property grid (status, priority, project, parent), rendered markdown description, sub-tickets, PR cards (state, check counts, ribbon; tap opens GitHub in the system browser), attachments (image viewer, others open externally), timeline, comment composer at the bottom. | Status (bottom sheet), Priority (bottom sheet), Comment (plain text, markdown allowed), Approve / Send back. **Not** editable: title, description, attachments (v1). |
| Settings | Name, server, theme (system default), version, "Copy `trellis` install command". | — |

Notifications: **none in v1.** The app has no push infrastructure and a local server cannot reach APNs; a v2 could poll on a background fetch. State this in Settings as "Notifications: not yet".

### 8.3 Live updates, offline, errors

- SSE via `expo/fetch` streaming when the app is foregrounded; otherwise refetch on focus.
- TanStack Query cache persisted to AsyncStorage; on launch the last data renders immediately with a thin amber "Offline — showing cached data" banner until the first successful request.
- Unreachable server: full-screen state on the current tab: "Can't reach 192.168.1.20:4400", "Retry", "Change server". If the URL was never reachable (setup mis-typed), the setup screen shows the specific error (`ECONNREFUSED`, timeout, non-trellis response).
- Mutations while offline fail immediately with a toast; no queueing in v1.

---

## 9. Visual design system

### 9.1 Type

Inter variable (`font-feature-settings: "cv11", "ss01"` for single-storey a and open digits; `tnum` on IDs, counts, times). Monospace: JetBrains Mono for agent chips, branch names, code, CLI snippets.

| Token | Size / line | Use |
|---|---|---|
| `text-2xs` | 11 / 16 | Badges, table footer |
| `text-xs` | 12 / 16 | Compact rows, timestamps, labels |
| `text-sm` | 13 / 20 | Default UI text, table rows, cards |
| `text-base` | 14 / 22 | Description body, comments |
| `text-md` | 16 / 24 | Composer title input, section headers |
| `text-lg` | 20 / 28 | Page titles |
| `text-xl` | 24 / 32 | Ticket title |

Weights: 400 body, 500 UI labels and titles, 600 headings. Never 700.

### 9.2 Spacing and radius

4px base: `1=4 2=8 3=12 4=16 5=20 6=24 8=32 10=40 12=48`. Radii: `sm=4` (chips, inputs), `md=6` (buttons, cards), `lg=8` (popovers), `xl=12` (dialogs, peek). Outer radius = inner radius + padding for nested surfaces.

### 9.3 Color tokens (semantic)

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FAFAFA` | `#0E0E11` | App background |
| `surface` | `#FFFFFF` | `#141418` | Sidebar, cards, rows |
| `elevated` | `#FFFFFF` + shadow | `#1B1B21` | Popovers, dialogs, peek |
| `border` | `#E6E6EA` | `#26262E` | Hairlines |
| `border-strong` | `#D0D0D6` | `#33333D` | Inputs, focused rows |
| `fg` | `#121215` | `#EDEDF0` | Primary text |
| `fg-muted` | `#6B6B76` | `#9A9AA6` | Secondary text, IDs |
| `fg-faint` | `#A0A0AA` | `#5E5E6A` | Placeholders, disabled |
| `accent` | `#5B5BD6` | `#7C7CF0` | Focus ring, selection, links, primary buttons |
| `accent-soft` | `#EEEEFB` | `#22224A` | Selected row tint |
| `agent` | `#7C3AED` | `#A78BFA` | Agent chips, agent comment border |
| `agent-soft` | `#F3EEFF` | `#2A1F47` | Agent chip background |
| `success` | `#16A34A` | `#4ADE80` | Passing checks, done |
| `warning` | `#D97706` | `#FBBF24` | Pending, WIP over limit, reconnecting |
| `danger` | `#DC2626` | `#F87171` | Failing checks, urgent, destructive |
| `scrim` | `rgba(0,0,0,.4)` | `rgba(0,0,0,.6)` | Dialog backdrop |

Shadows: `sm` (rows hover) `0 1px 2px rgba(0,0,0,.06)`, `md` (popovers) `0 4px 12px rgba(0,0,0,.10)`, `lg` (peek, dialogs) `0 12px 32px rgba(0,0,0,.16)`; in dark mode shadows are replaced by a 1px `border-strong` plus a subtler shadow.

### 9.4 Status colors by category (icons are Linear's circle language)

| Category | Color | Icon |
|---|---|---|
| todo | `fg-faint` | Empty circle |
| started | `warning` | Circle with a half-filled ring (progress ring; sub-ticket progress fills the ring when present) |
| review | `accent` (agent-reviewer statuses use `agent`) | Circle with a dotted ring; agent-review variant contains the `⟡` glyph |
| done | `success` | Filled circle with check |
| canceled | `fg-faint` | Circle with ×; ticket title struck through |

### 9.5 Priority icons

Linear-like signal bars, 16px: none = three faint dashes (only in pickers; hidden on cards), low = 1 of 3 bars filled, medium = 2, high = 3, urgent = filled `danger` rounded square with `!`. Bars use `fg-muted`, not color, so priority never competes with CI red.

### 9.6 Motion rules (`motion`)

| Thing | Duration / easing |
|---|---|
| Hover/pressed state, popover open | 120ms, ease-out |
| Popover/dialog enter | 160ms, opacity + 4px translate; exit 100ms |
| Peek slide | 240ms, `cubic-bezier(.2,.8,.2,1)`; exit 180ms |
| Row/card enter (created) | 160ms fade + 4px rise |
| Row/card leave (approved, moved out of filter) | 200ms collapse height + fade ("approve sweep") |
| Bulk bar | 180ms rise |
| Toasts (sonner) | defaults |

Never animates: table rows re-sorting on SSE updates (they jump; no FLIP, because animating 200 rows is noise), text content changes, numbers/counters, skeleton → content (instant swap), theme switch. Layout shifts from live data are avoided by keeping row heights fixed.

### 9.7 Signature details (what makes screenshots shareable)

1. **Check ribbon** — the segmented CI bar on PR rows and cards. Nobody else renders CI as a barcode; it reads instantly and looks like trellis.
2. **Agent chips with the live dot** — `⟡ claude · agent` in mono with a pulsing dot while the agent is active. A board full of these is the "agents are working" screenshot.
3. **Approve sweep** — on Needs you, `a` approves and the row collapses out with the count ticking down; ten approvals in ten keystrokes is the demo GIF.
4. **Start with agent** — a primary button whose click copies a ready shell command and shows it in the toast in mono. The clearest single-frame explanation of what the product is for.

### 9.8 Focus rings and density

`:focus-visible` only: 2px `accent` outline, 2px offset, radius follows the element. Rows/cards use an inset left bar instead of an outline to avoid clipping in virtualized containers. No focus styling on mouse click.

---

## 10. Empty states, loading, errors, offline

### 10.1 First-run onboarding

`/setup`: two steps in one card. (1) Name. (2) First project: name field; key auto-suggested from the name (first letters of words, uppercased, 2–5 chars, unique; editable, validated live: `A–Z`, 2–5 chars). Below: "Tickets will be numbered `CDE-1`, `CDE-2` …". Create → land on `/p/CDE` with the project empty state, which includes the CLI install line and `trellis create -p CDE -t "…"`. A dismissible "Set up agents" card on Needs you links to Settings → Agents.

### 10.2 Skeletons vs spinners

- Lists, boards, ticket pages: **skeletons** shaped like the real rows (same height/density) for up to 300ms; if data arrives sooner, render directly (no flash). Never show a skeleton on navigation between already-cached routes; TanStack Query serves cached data instantly and revalidates.
- Spinners only inside buttons during a pending non-optimistic action (e.g., PR refresh, file upload progress uses a bar).
- Route-level suspense boundary per route so the sidebar never skeletons.

### 10.3 Optimistic updates and rollback

Optimistic for: status, priority, project, parent, board reorder, title, comment post, ticket create (temporary ID `CDE-…` shown as `…` until the server responds). Not optimistic: delete (confirm first, then pending state), file upload, PR link (needs `gh` validation).

On failure: TanStack Query `onError` restores the snapshot, and sonner shows `Couldn't move CDE-42 to Done` with the server's message on the second line and a **Retry** action. Toast stays 6s (errors), 3s (success). Success toasts appear only for actions whose result is not visible on screen (copy, create-from-composer, bulk actions).

SSE events are the reconciliation source: every mutation response and every event carries `updatedAt`; the client applies the newer one, so an optimistic write is never overwritten by a stale event.

### 10.4 Server restarts and SSE reconnect

- SSE at `/events` with `Last-Event-ID`; the server keeps a ring buffer of the last 1000 events with sequence numbers.
- On disconnect: reconnect with backoff 1s → 2s → 4s → 8s (cap). After 3s without connection, a thin top banner: "Reconnecting to trellis…" (amber, no spinner). Mutations still attempt and fail with a toast.
- On reconnect with a valid `Last-Event-ID`: replay the gap. If the ID is unknown (server restarted): invalidate all queries (one refetch burst) and show a 2s "Reconnected" banner in green.
- Connection dot in the sidebar mirrors this state.

### 10.5 Other errors

- 404 ticket (`/t/CDE-999`): "CDE-999 doesn't exist" with a search link.
- Validation (e.g., moving a ticket across root projects): inline message in the picker, never a toast alone.
- `gh` errors: shown in the PR section, not globally.

---

## 11. Accessibility

- Every action has a keyboard route: the shortcut map (5.6), a visible button, or a Cmd-K entry. Nothing is hover-only: hover-revealed row actions are also in the row's `…` menu and reachable with `Tab` when the row is focused.
- Table: `role="grid"` with roving `tabindex`; `aria-rowcount` for the virtualized count; `aria-selected` on selected rows; group headers as `role="rowgroup"` with `aria-expanded`.
- Board: columns are `role="list"` with `aria-label="In Progress, 4 tickets"`; cards `role="listitem"` and focusable. Drag-and-drop has a full keyboard equivalent (`s`, `[`/`]`, `Shift+↑/↓`) and pragmatic-dnd announces via a live region: "CDE-42 picked up from Todo, position 2 of 5", "Moved to In Progress, position 1 of 3", "Drop canceled". The status picker is exposed as the primary method in the shortcut help; dragging is the enhancement.
- Peek is `role="dialog"` non-modal (`aria-modal="false"`) with focus moved to the title on open and returned to the originating row on close; full page is a normal document.
- Popovers, dialogs, menus, and toasts come from shadcn/radix and keep their built-in focus management; sonner region announced politely.
- Color is never the sole signal: status has icons, priority has bar counts, CI has icons and counts alongside the ribbon, agent chips have the glyph and the `· agent` text.
- Contrast: all text ≥ 4.5:1 on its surface, icons and hairline-adjacent controls ≥ 3:1; verified for both themes in the token table.
- Reduced motion (`prefers-reduced-motion`): slides and rises become 80ms opacity fades; approve sweep becomes an instant removal; the live agent dot stops pulsing; check ribbon shimmer stops.
- Touch targets on mobile ≥ 44px; swipe actions always have an equivalent button in the ticket header.

---

## Appendix A — Data implied by this design (for the schema)

- `status`: `id, project_id, name, slug, category, reviewer (nullable; only for review), position, wip_limit (nullable), is_default`.
- `ticket`: adds `branch_slug`, `board_position` per status (`ticket_board_position` table keyed by ticket and status), `search_vector`.
- `pr`: `ticket_id, url, number, repo, title, state (open|draft|merged|closed), head_ref, base_ref, review_state, checks_json, fetched_at`.
- `activity`: `ticket_id, actor_name, actor_kind, type, from, to, at`.
- Every mutation procedure takes `actor: { name, kind }` from headers; the CLI and web both set them.

## Appendix B — CLI touchpoints referenced

`trellis brief <id>`, `trellis status <id> <slug>`, `trellis comment <id> "<md>"`, `trellis pr add <id> <url>`, `trellis create -p <ref> -t "<title>"`, `trellis ls` with the URL filter grammar, `trellis show <id>`. Exit codes: 0 ok, 1 error, 2 not found, 3 refused (policy, e.g. agent → done).

---

### Critical Files for Implementation

No code exists yet; these are the files this design most directly determines, to be created in the worktree:

- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/routes/p.$.tsx` — project splat route: path/slug/view parsing, filter/sort/group search-param schema, peek param (sections 1.3, 5.2).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/features/ticket/TicketView.tsx` — shared peek/full-page ticket body: rail, PR rows with check ribbon, attachments, interleaved timeline, actor chips (section 2).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/features/needs-you/NeedsYou.tsx` — home inbox sections, approve/send-back actions and sweep animation (section 7.5).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/packages/server/src/db/schema.ts` — statuses with `category`/`reviewer`, board positions, PR checks, activity with actor name/kind (Appendix A).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/styles/tokens.css` — Tailwind v4 theme tokens for light/dark, status/priority/agent colors, type and spacing scales (section 9).