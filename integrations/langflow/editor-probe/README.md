# Langflow editor probe

This source prepares the bounded editor checks for TRL-672.

The probe consumes the public V1 flow contract from TRL-665. Its fixtures use the typed examples from `packages/api/src/schemas/flowV1Fixtures.ts`.

The grant permits document reads, document saves, and component manifest reads. It rejects direct runs, Playground, Share, Python, imports, provider keys, component replacement, and decisions.

The save probe requires the exact actor, host, flow, project, revision, operation, and expiry. It also requires the public `expectedVersion` save contract.

The inspector and keyboard helpers prepare the later probe. They do not exercise the pinned Langflow handlers or typed ports.

The source contains no Langflow files or frontend dependencies. TRL-667 owns the sole pinned source and environment.

The gateway prototype serves the pinned build on loopback. It uses only isolated fixture data. It requires a non-secret fixture session marker at each protected HTTP boundary. It records accepted save bytes, request identities, revisions, and replay results.

TRL-667 owns the process that runs these commands:

```sh
env \
  TRL_EDITOR_ASSETS=/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-langflow-fec71dca-py312-macos-arm64/source/src/frontend/build \
  TRL_EDITOR_EVIDENCE=/var/folders/zc/q6614tmx3tx362p94vvrfn0w0000gn/T/trellis-langflow-fec71dca-py312-macos-arm64/runs/TRL-672/gateway-ec23fcc9-evidence.json \
  TRL_EDITOR_DEADLINE=2026-09-29T12:00:00Z \
  TRL_EDITOR_PORT=4172 \
  bun integrations/langflow/editor-probe/src/httpProbeServer.ts

env TRL_EDITOR_ORIGIN=http://127.0.0.1:4172 \
  bun integrations/langflow/editor-probe/src/httpProbeFixture.ts
```

The HTTP fixture records HTTP proof. Aside records the separate editor interaction proof.

After the editor route sets the fixture cookie, `/__probe/narrow` loads the same editor in a 320-by-800-pixel iframe. Measure the child viewport in Aside. The frame contains the real compiled editor, not a replacement graph.

The process owner can set `TRL_EDITOR_GRAPH_CASE=required-density` or `TRL_EDITOR_GRAPH_CASE=beyond-former-cutoffs` before a fresh start. These select the merged TRL-673 graphs with 500/2000/50 and 501/2001/51 nodes, edges, and rounds. The default remains the seven-node fixture. Each start retains revision 2. Run `httpProbeFixture.ts` against the default case; it submits the seven-node document. Dense browser evidence requires the selected dense case.

The focused source checks use the matching dependencies from the canonical Trellis checkout. They do not install a package or start a process:

The browser fixture spaces rows 800 pixels apart so the expanded cards do not overlap. The dense node identities, fields, edges, and viewport stay unchanged. The editor starts at the saved viewport and exposes its existing zoom controls. ReactFlow receives render-only dimensions and empty handles for unmeasured nodes. It measures visible cards before it draws their edges. The save hook reads the complete graph from the flow store.

```sh
bun test \
  integrations/langflow/editor-probe/src/canvasProjection.test.ts \
  integrations/langflow/editor-probe/src/editorBoundary.test.ts \
  integrations/langflow/editor-probe/src/gatewayProtocol.test.ts \
  integrations/langflow/editor-probe/src/probeGraph.test.ts
bun x --no-install tsc --noEmit -p integrations/langflow/editor-probe/tsconfig.json
bun x --no-install @biomejs/biome check integrations/langflow/editor-probe/src
```

The read-only visibility check uses the existing pinned ReactFlow dependency. It starts no browser or server:

```sh
bun integrations/langflow/editor-probe/frontend/canvasVisibility.ts "$LANGFLOW_SOURCE/src/frontend"
```
