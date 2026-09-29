# Trusted native policies

`NativePolicyConfigurationV1Schema` defines the explicit configuration file:

```ts
{
  schemaVersion: 1,
  source: { flowId, version, sha256 },
  packageIdentity: { enginePackageDigest, componentManifestHash, engineOverlayHash },
  nativePolicies: { [sourceNodeId]: { sourceHarness, harness } }
}
```

`source.sha256` covers the exact effective source bytes for one conversion or regeneration.
`source.version` retains the legacy source version; edited provenance identifies the derived document revision.
The selected package supplies the package, catalog, and overlay digests.
`sourceHarness` equals `node.harness ?? source.flow.harness`, including absent fields and original strings.
Each policy identifies an agent, native gate, or loop condition in that source.
Human and review gates require no native policy.

`readTrustedNativePolicies({configuration,sourceBytes,packageIdentity})` checks these bindings.
`configuration` contains original `bytes` and an independently trusted `sha256`, or null.
The bootstrap owner reads both from explicit trusted configuration after the durable receipt lookup.
API requests, graph fields, and editor content cannot supply this authority.
The reader retains copies of the configuration bytes and returns the existing compiler map.
Its result is `ready` with the map and bindings, or `blocked` with diagnostics.
Missing configuration or a missing node policy returns `conversion_native_policy_unresolved` for a native source.
A source without native nodes can return an empty map with null configuration.

`ResolvedConversionHarnessSchema` checks explicit commands and supported settings without defaults or normalization.
Non-custom presets require an explicit supported model.
When `effortForHarness(preset,model)` declares options, effort must match an explicit option.
When it returns null, effort must stay absent, including for Muse.
Custom commands require absent model and effort, as the native harness contract specifies.
Every explicit inherited source field must match the resolved harness exactly.

`createTrustedConversionProducer(input,validate)` wraps the concrete tree compiler.
`input` replaces `ConversionCompilerInput.nativePolicies` with `configuration`.
Each `compile` call checks its exact `sourceBytes`; each `regenerate` call checks its exact `editedSourceBytes`.
An edit requires configuration bound to the edited bytes, even when only the instruction changes.
The wrapper copies configuration and package inputs when the factory runs.
Bootstrap retains the original configuration and trusted digest for replay and audit.
The compiler, provenance reader, and installed publisher retain their separate qualification checks.
