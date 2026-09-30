This directory contains the local create-ticket prototype for TRL-1251.

The composer puts the title and description above one row of ticket properties. One searchable picker selects the agent and its model. The same picker contains the effort and account fields. The main action creates the ticket and assigns the selected agent.

The design uses the [Linear issue composer](https://linear.app/docs/creating-issues) as a reference for hierarchy and density. It uses the Trellis components and color tokens. The prototype gives the primary action a flat finish.

Close and Escape keep the draft in memory. New ticket opens that draft. The explicit discard action asks for confirmation. Create another clears the content and keeps the settings. An assignment error permits a retry or an unassigned ticket.

All records stay in memory. The preview makes no API request. The project and epic use the current ticket context. The models and accounts are sample options. File selection retains names only. A page refresh or a preview-state change clears the draft.

From the repository root, use the installed Vite executable:

```sh
node_modules/.bin/vite --config packages/ui/gallery/createTicket/vite.config.ts --host 127.0.0.1
```

Build a standalone local file:

```sh
trellis_preview_dir=$(mktemp -d "$TMPDIR/trellis-create-ticket-XXXXXX")
node_modules/.bin/vite build --config packages/ui/gallery/createTicket/vite.config.ts --outDir "$trellis_preview_dir/site"
bun packages/ui/gallery/createTicket/buildStandalone/buildStandalone.ts "$trellis_preview_dir/site" .review/create-ticket-prototypes.html
```

The standalone HTML contains its script, styles, fonts, and image bytes. It opens from a local file and fits the Page sandbox. The gallery uses a Base UI dialog inside its preview container. Its keyboard focus can reach the preview controls. The `?view=preview` route uses the canonical modal and its focus trap.

Remove the temporary directory after publication. Stop the preview server when the review ends.

Run the focused checks:

```sh
node_modules/.bin/biome check packages/ui/gallery/createTicket
node_modules/.bin/tsc --noEmit -p packages/ui/gallery/createTicket/tsconfig.json
```

The app uses the approved composer through `packages/ui/src/domain/TicketComposer` and `apps/web/src/features/composer`. Its model and account choices come from the application. It uploads attachments before assignment. A failed assignment retains the saved ticket and its request ID. This gallery remains the approved design reference.
