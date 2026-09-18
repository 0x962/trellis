# Terminal renderer patch

Bun applies the WebGL patch through `patchedDependencies` in the root `package.json`.
The exact pins match [Superset commit 1019540](https://github.com/superset-sh/superset/tree/1019540c0be5069eb5ff3ebb22e5707a42e0999d).

`@xterm/addon-webgl` uses `0.20.0-beta.297` because it includes atlas eviction, texture-count limits, and renderer invalidation after atlas changes.
The addon requires `@xterm/xterm` version `^6.1.0-beta.300`; Trellis pins `6.1.0-beta.302`.
The stable WebGL release, `0.19.0`, lacks these atlas controls.

The patch limits both texture dimensions to 4096 pixels and releases the canvas storage after page removal.
A 4096-square RGBA page uses 64 MiB before driver overhead.
The patch changes both compiled bundles and their source files.
The changes follow the findings in [Superset's patch notes](https://github.com/superset-sh/superset/blob/1019540c0be5069eb5ff3ebb22e5707a42e0999d/patches/README.md).
Trellis generates its patch against the upstream npm package.
The xterm.js authors provide the addon under the [MIT license](xterm-LICENSE.txt).

For a dependency update, inspect the upstream fixes before you retain or remove the patch.
Verify texture limits and canvas release in both installed bundles.
Check actual terminal output, scroll, resize, and GPU context loss in the browser.
