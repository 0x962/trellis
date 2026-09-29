# Mounted editor checks after PR674

The shared candidate uses source `a52a542edb7173fce59a451f7da5dc5b89e8e24f` and editor patch `9a33da5d85c5ba3ff8b57f32af57400b1c2fe3cd4a68bd5131d78829f77ebb0c`.
The asset manifest is `814ffbc5e8045d79f8725b0273d6e970c8d4c4c99a3162d5da4cac07f313174b`.
TRL-667 owns the gateway and its retained evidence under `runs/editor-a52a542e` in the sole candidate.

## Default graph

Aside opens the actual compiled editor at 1440 by 900 pixels. Seven cards appear at the saved 75% zoom.
The keyboard selects the Agent output and the Native gate question input with Enter. The edge appears, and the gateway accepts revision 3.
The accepted request ID is `522db936-f765-4fd9-9afd-1c9ea546e3ce`.

The narrow fixture loads the same editor in a 320-by-800-pixel frame. The document width remains 320 pixels.
The canvas retains 75% zoom. The Save and zoom buttons measure 44 pixels high.
The instruction dialog closes after Finish Editing and returns focus to its Expand text editor button.
The zoom menu changes the scale to 100%. Escape closes the menu and returns focus to the zoom button.

Screenshots remain in `/Users/navidkhan/.aside/u/0/sessions/2026-09-29_sGS6TRZhg1haafdj/artifacts/`:

- `repair-desktop.png`
- `repair-narrow.png`
- `repair-narrow-zoom100.png`

## Reload and save failure

The new narrow frame reads the saved graph at revision 3. Its save module still initializes the expected revision from the build value, 2.
An instruction edit then receives HTTP 403 with `revision_mismatch`. An explicit Save receives the same refusal.
The rejected request IDs are `b3dfb854-8dbd-4ed7-9ca3-08a031db3730` and `76f1c622-b2c6-42bb-9bfb-af08904f6a31`.
The gateway retains revision 3 and the armed lost-response fault. This sequence does not prove explicit Retry after a reload.

Aside reports a navigation readiness timeout on the narrow route. A subsequent snapshot and screenshot show the loaded editor.
Dense navigation and real-engine progress require separate proof.

## Source correction

The follow-up patch reads the public document before it loads the canvas. It binds the revision and component manifest from that response.
It rejects a response for another flow. The save path no longer takes its expected revision from the build environment.
The explicit Retry path retains the original request identity and document bytes after a newer draft.

The focused command below passes seven tests and 8,067 assertions:

```sh
nice -n 10 bun test integrations/langflow/editor-probe/src/editorSave.test.ts integrations/langflow/editor-probe/src/canvasProjection.test.ts
```

The gateway type check passes. Biome passes on the new fixture. The plain patch apply check passes against the pinned source.
These checks prove source behavior only. The shared build and the actual reload sequence remain pending.
