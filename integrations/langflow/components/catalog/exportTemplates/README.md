# Engine template export

`export_frontend_templates` returns UTF-8 JSON bytes for `frontend-templates.v1.json`.
The caller supplies the matched Trellis root, engine root, expected catalog hash, engine commit, and applied overlay hash.
The catalog package exports this function:

```python
export_frontend_templates(
	trellis_root: Path,
	engine_root: Path,
	expected_manifest_sha256: str,
	*,
	engine_commit: str,
	engine_overlay_sha256: str,
) -> bytes
```

The package owner verifies the applied patch series and supplies its SHA256 as `engine_overlay_sha256`.
The exporter records that value; it does not apply or verify the complete patch series.
The exporter verifies the original catalog bytes and every declared source through `read_catalog`.
It requires imported `Component` and definition classes to resolve to the declared files.
It instantiates each class with the stable ID `catalog-<definition.id>` and calls its real `to_frontend_node` method.
It requires the returned code field to equal that class's UTF-8 source text.
It preserves the complete returned object, including defaults and engine metadata.

The export has this shape:

```text
{
  schemaVersion: 1,
  kind: "trellis-frontend-templates",
  catalogId: string,
  componentManifestHash: string,
  engine: { name: string, version: string, commit: string },
  engineOverlayHash: string,
  allowedForPublication: boolean,
  supportedMappings: array,
  legacyMappings: array,
  blockers: object,
  definitions: [{
    id: string, version: number, className: string,
    source: { root: string, path: string, sha256: string },
    qualification: string,
    allowedForPublication: boolean,
    frontendTemplate: { data: { node: object, type: string, id: string }, id: string }
  }]
}
```

`frontendTemplate.data.node` is the full native inspector template.
`frontendTemplate.data.type` is its native component key.
The editor uses a fresh graph node ID when it creates an instance from this template.
The `code` field is installed component source and must remain immutable during graph edits.
The source declaration `template` remains separate from this engine result.
The exporter preserves all qualification fields and blockers from the catalog.
A complete template does not authorize publication or conversion.

The final package seals the exact export bytes, catalog bytes, and applied overlay identity together.
The export binds the source catalog hash rather than the final package digest to avoid a digest cycle.
Consumers compare `componentManifestHash` and `engineOverlayHash` with that verified package before they use any template.
Consumers match definitions by `id` and retain all unavailable mappings and blocker descriptions.
The public endpoint must supply this export separately from the source manifest.

The command writes a new file outside both source roots.
Its caller configures imports from the same matched roots before Python starts.
It refuses an existing output file and a parent alias into either source root.
The [batch instructions](../../../tests/catalog/README.md) contain the deferred export command.
