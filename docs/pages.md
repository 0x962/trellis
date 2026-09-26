# Pages

A Page belongs to a project and holds an HTML document with its assets.
The source stays in the agent workspace. Each publication stores an immutable version.
The Page keeps its identity, address, comments, and history across publications.

## Publish and revise

Publish one HTML file, or a directory with `index.html` and its assets:

```sh
trellis page publish reports/forecast --project DEMO --title "Quarter forecast"
```

The result contains the Page reference, its revision, and a `trellis://page/<id>` link.
Use the returned reference for later commands. The examples below use `DEMO/pages/quarter-forecast`.

```sh
trellis page show DEMO/pages/quarter-forecast
trellis page publish reports/forecast --page DEMO/pages/quarter-forecast --expected-version 1 --label "Revised forecast"
```

`--expected-version` takes the Page's `revision`, not its published version number.
Rename, delete, and restore also advance the revision. They add no content version.
A stale revision returns `PAGE_VERSION_CONFLICT` and writes no version.
Read the current Page before you revise the source or repeat the publication.

Each publication has a request ID. `--request-id <uuid>` lets a caller repeat the same request after an interrupted response.
The same request returns its first result. Different bytes under that ID cause a conflict.

Each version holds its own asset list. An omitted asset does not carry forward from the previous version.
Relative asset links resolve inside that version. Remote fonts, scripts, images, and network requests do not work in the viewer.
Keep every required asset in the published directory.

| Limit | Value |
| --- | --- |
| HTML document | 1 byte to 16 MiB |
| Assets per version | 200 |
| One asset | 0 to 100 MiB |
| All assets in one version | 250 MiB |
| Title | 1 to 200 characters |
| Summary | Up to 2,000 characters |
| Asset path | Up to 1,024 UTF-8 bytes |

The host upload limit can impose a smaller per-file limit.
Asset paths cannot be absolute, traverse a parent directory, name `index.html`, or start with `.trellis/`.
The CLI reads file symlinks and skips directory symlinks.

## Find and read

Open **Pages** in the project menu. The list supports text, author, watcher, comment, and pin filters.
The URL keeps the filters. Pins belong to the current actor and sort first.

```sh
trellis page list --project DEMO --q forecast --all
trellis page pin DEMO/pages/quarter-forecast
trellis page unpin DEMO/pages/quarter-forecast
trellis page versions DEMO/pages/quarter-forecast
trellis page show DEMO/pages/quarter-forecast --version 1
```

Search matches the title, summary, and static text of the latest version, in that rank order.
Search excludes deleted Pages. Script output does not enter the index.
Historical text remains in its version but does not match a search of the latest content.

**Version history** opens an older version. **Back to current** returns to the latest version.
The historical view marks the version as read-only. It permits no new comment, reply, or resolution in that view.

**Share Page** copies the stable Trellis link. It contains no render lease or host token.
The desktop resolves the Page ID to its current route.
The browser route `/p/<KEY>/pages/<slug>?version=<number>` selects a historical version.

## Comments

Select text, open the context menu on an element, or focus an element and press **C**.
Enter the comment in the trusted Trellis editor. Submit it with **Comment** or Enter.
A selected text anchor permits up to 2,000 characters.
The anchor belongs to the exact version that the reader sees.

The viewer places numbered pins beside matching anchors. A pin opens its thread.
The thread shows its author, version, original anchor, replies, and resolution state.
**Show resolved threads** includes resolved threads in the list.
An older thread stays with its original version after a publication.
The current view can open that version from the thread anchor.

At widths below 80 rem, **Comments** opens the shared sheet.
At wider widths, comments occupy the right pane.
Escape closes an empty draft. A draft with text asks before discard.
An anchor that no longer matches a document element has no visible pin.

The API exposes `pages.comments`, `comment`, `commentReply`, `commentResolve`, `commentEdit`, and `commentDelete`.
The Page CLI currently has no comment command.

## Watcher

TRL-449 supplies the watcher API and controls. Complete its integration before the release checks below.
The commands in this section require that dependency.

```sh
trellis page watch DEMO/pages/quarter-forecast --agent <agent-id>
trellis page unwatch DEMO/pages/quarter-forecast
```

One assigned agent in the same project receives human comments for the Page.
A publishing agent becomes the watcher when the Page has no watcher.
A person can change the watcher. A publishing agent can manage its own watch but cannot replace another agent's watch.
The API accepts `pages.watch({page, agentId})`; a null agent ID removes the watch.
`PUT /api/pages/watch/{+page}` accepts an `agentId` field and returns `PageSummary`.

Each reserved batch holds up to five human comments and has a 30-second lease.
The saved batch keeps its message ID, prompt, end cursor, and original terminal and session.
A repeated delivery keeps the message ID, prompt, and end cursor. Newer comments wait for a later batch.
Delivery can use a resumed attempt only if the previous attempt stopped without a runtime record for that message.
An uncertain send with a runtime record stays held for that attempt.
Comment creation and replies serialize timestamps per Page, so a delayed request cannot fall behind the delivery cursor.
The cursor advances after runtime acceptance. A stopped process keeps its assignment.
A receipt completes an accepted batch after a restart without a second send.
Unsent comments can reach the resumed process after the receipt check.
Runtime acceptance proves that Trellis accepts the message, not that the provider finishes the requested work.

## Pull the source

```sh
trellis page pull DEMO/pages/quarter-forecast --version 1 --out ./forecast-v1
```

The command writes the original `index.html` and every asset at its stored path.
It overwrites matching files in the output directory. Use an empty directory for an exact snapshot.
The CLI requests `?download=1` on each authorized content URL.
The server returns stored bytes with an attachment disposition and the same lease checks.
The downloaded HTML contains no injected viewer runtime.

**Pull source snapshot** in the Page menu downloads the selected version as a ZIP file.
The ZIP also contains the stored source bytes. Its download grant expires after five minutes.

## Delete and restore

```sh
trellis page show DEMO/pages/quarter-forecast
trellis page rm DEMO/pages/quarter-forecast --expected-version 3 --yes
trellis page show DEMO/pages/quarter-forecast --include-deleted
trellis page restore DEMO/pages/quarter-forecast --expected-version 4
```

Replace the example revisions with the current values.
An agent needs `--force` for delete and restore.
Delete removes the Page from lists and Search, ends its watch, and blocks its content URLs.
The deleted view shows the actor and purge date. Restore keeps the Page identity, versions, and comments.
Restore does not recreate the watch.

Trellis retains a deleted Page for 30 days. Restore fails after that period.
The collector purges due Pages at boot and once each hour.
An archived project permits reads but refuses Page changes.

## Security and lease expiry

The app mounts a fixed wrapper around the untrusted document.
Both frames use `sandbox="allow-scripts"`, without same-origin access.
The wrapper's policy limits its child to the authorized content path.
The document policy limits assets to that version and blocks connections, forms, nested frames, plugins, and runtime code creation.

The app checks each message's source, nonce, type, and payload.
A Page can forge a message with its own nonce, so a message cannot authorize a mutation.
A link request opens a trusted confirmation dialog.
The desktop opens a confirmed HTTPS link in the isolated browser sheet.
The browser opens a confirmed external link in a new tab.

A render lease ends after 30 idle minutes or eight hours from creation.
The visible viewer renews it every 20 minutes.
A server restart invalidates all leases.
The viewer requests the same version again, restores its scroll position, and announces “Page refreshed for security”.
Scroll restoration is immediate. Comment reveal respects the reduced-motion preference.

## Backup and rollback

Backups include the database, attachments, and referenced Page objects, including retained deletes and staged uploads.
Restore checks each Page object's hash and size before it replaces the active home.
Restore refuses unknown manifest capabilities, corrupt objects, missing objects, and an invalid database archive.

The pre-Pages reader at `e9f8d42cc` ignores capability manifests.
Its restore reader preserves the additional Page files, but its own backup writer omits them.
Before a binary rollback, retain a backup from a Pages-capable release.
Do not run a down migration for a binary rollback.
The old-source restore probe does not prove an installed binary rollback.

## Acceptance checks

Run these checks from the repository root:

```sh
bun test apps/server/src/services/pages packages/cli/src/commands/page apps/web/src/features/pages apps/desktop/src/secureLinkBrowser
bun test apps/server/src/routes/pageRender apps/server/src/routes/pageArchive apps/server/src/app.pages.test.ts
bun test apps/server/src/storage/backups.test.ts apps/server/src/restore.test.ts
bun test apps/desktop/src/navigation apps/server/src/services/internalLinks
bun run typecheck
bun run typecheck:repo
bun run --cwd apps/web build
git diff --check
```

`services/pages/acceptance.test.ts` joins publication, comments, revisions, history, source, Search, delete, and restore in one database test.
It verifies two assets, an empty asset, immutable source bytes, historical anchors, and separate revision and version numbers.
`renderScript/renderMotion.test.ts` executes the injected runtime with both motion preferences.
Route tests verify source downloads and the host-auth boundary.
These tests do not prove a native desktop session.

TRL-449 requires runtime protocol 13 for the receipt check after Stop and Resume.
The release owner must install a matching host and runtime before the watch checks.

Complete the release checks on an authorized installed release:

1. Publish a directory with two assets from a project agent.
2. Add an anchored comment as a person.
3. Confirm one watcher message for that comment batch.
4. Republish with the current revision, then reply and resolve the original thread.
5. Open both versions and pull the old source.
6. Compare the document and asset hashes with the original files.
7. Open the internal Page link and a confirmed external HTTPS link in the desktop app.
8. Delete the Page, then confirm its absence from Search.
9. Restore the Page, then confirm its history, comments, and Search result.
10. Check the current and historical views at 200 percent browser zoom and a 390-pixel phone viewport.
11. Check keyboard focus, 44-pixel touch controls, both themes, and reduced motion.
12. Run the hostile HTML probes against the installed viewer.
13. Restore a backup in an isolated home and compare its source hashes.
14. Complete the authorized prior-binary rollback and reinstall check in an isolated home.

Keep fixture, database, and installed-release results separate in the evidence.
The release remains incomplete while a required check has no result.
