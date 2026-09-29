# Trellis website

This directory contains the approved Trellis marketing website and its product guide.
The examples use fictional data. The diagrams, tabs, and ticket dialogs run in the browser.

## Preview

From the repository root, start a local static server:

```sh
python3 -m http.server 6395 --bind 127.0.0.1 --directory marketing
```

Open `http://127.0.0.1:6395/`. Stop the server with Control-C.
Serve this directory over HTTP so the browser can load its JavaScript modules.
The site needs no build, package install, API, or external asset request.
A static host must serve JavaScript with its normal MIME type.

## Source

`index.html` contains the website. `guide.html` contains the product guide.
`app.js` loads the navigation, scene, feature demonstrations, and motion modules.
The styles load in this order: `style.css`, `layout.css`, then `identity.css`.
The last file defines the mineral teal brand, custom wordmark layout, and interactive diagrams.

The website uses its approved marketing design, separate from the application components in `packages/ui`.
The bare mark and square mark use the same Trellis geometry.

## Checks

Run the focused repository check:

```sh
bunx --no-install biome check marketing
```

The scoped Biome configuration preserves focusable ARIA tab panels and named groups of diagram controls.
Vendor files retain their original bytes and licenses.
The styles retain cascade warnings from the approved design.

In the browser, check desktop and narrow layouts, keyboard tabs, ticket dialogs, and the guide links.
Check all six scene nodes, the three stages, Pause, and both states of each feature diagram.
Check the page with reduced motion enabled.

## Local assets

| Asset | Version | License |
| --- | --- | --- |
| Motion | 13.2.0 | `vendor/MOTION-LICENSE.md` |
| Three.js | 0.160.1 | `vendor/THREE-LICENSE.txt` |
| Inter Latin variable font | Bundled font file | `vendor/inter-LICENSE.txt` |
| JetBrains Mono Latin 400 | Bundled font file | `vendor/jetbrains-mono-LICENSE.txt` |
