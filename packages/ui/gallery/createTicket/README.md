This directory contains the local design prototypes for TRL-1251.

Design A keeps agent selection in a compact row. A popover holds the model, effort, and account. Design B shows those settings in a side panel. Both designs use the existing Trellis components and color tokens.

The preview supports title and description editing, ticket properties, wave selection, attachments by name, agent selection, model settings, and creation with or without assignment. The assignment error scenario permits a retry or an unassigned ticket. Create another preserves settings and clears the content.

All records stay in memory. The preview makes no API request. The project and epic use the current ticket context. The models and accounts are sample options. File selection retains names only. A page refresh or a design change clears the draft.

From the repository root, use the installed Vite executable:

```sh
node_modules/.bin/vite --config packages/ui/gallery/createTicket/vite.config.ts --host 127.0.0.1
```

The build uses relative asset paths for local Trellis Pages:

```sh
trellis_preview_dir=$(mktemp -d "$TMPDIR/trellis-create-ticket-XXXXXX")
node_modules/.bin/vite build --config packages/ui/gallery/createTicket/vite.config.ts --outDir "$trellis_preview_dir/site"
bun packages/ui/gallery/createTicket/buildStandalone/buildStandalone.ts "$trellis_preview_dir/site" .review/create-ticket-prototypes.html
```

The standalone HTML contains the script, styles, fonts, and image bytes. It opens from a local file and fits the Page sandbox. The comparison view uses a Base UI dialog inside the preview container. Its keyboard focus can reach the comparison controls. The `?view=preview` route uses the canonical modal and its focus trap.

Remove the temporary directory after publication. Stop the preview server when the review ends.

The focused checks are:

```sh
node_modules/.bin/biome check packages/ui/gallery/createTicket
node_modules/.bin/tsc --noEmit -p packages/ui/gallery/createTicket/tsconfig.json
```

Production integration waits for the design choice. It must preserve placement rules, draft recovery, attachments, keyboard controls, and the assignment request identity. An assignment failure must retain the created ticket and must not create a second ticket on retry.
