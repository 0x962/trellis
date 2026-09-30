# Captured conversation export

`HarnessHost.exportConversation` copies retained conversation bytes from a runtime capture into a private directory. Each harness selects its own transcript format through `providers`.

## Capture lifetime

The caller passes the producer from `RuntimeClient.withCaptureSnapshot` to each export call. The producer supplies the full capture identity and logical conversation roots. Each inventory path is relative to its conversation directory.

The runtime must compare the original account, profile, run, attempt, workspace, and provider session with its retained launch record. Each read and seal must validate the same held capture. Missing metadata or an unavailable provider root prevents export.

The outer callback must cover the workspace archive, conversation archives, database snapshot, and aggregate manifest seal. A conversation receipt seals one component. It does not release the capture or prove that the aggregate snapshot is complete.

## Retained formats

| Harness | Selected content | Session identity |
| --- | --- | --- |
| Codex | Matching JSONL files from the active and archived session roots | `session_meta.payload.id` |
| Claude | Matching JSONL file from the projects root and its session subtree | `sessionId` |
| Pi | Matching JSONL file from the sessions root | Session header `id` |
| Muse | Matching `session.jsonl` and its session directory | `stream.id`, including framed records |
| OpenCode | Previously retained `session.json` export | `info.id` |

The OpenCode reader requires a retained export. It does not request one from the provider. Missing transcripts, ambiguous matches, unsupported identities, and symbolic links produce explicit refusals.

## Archive files

The destination is a new directory with mode `0700`. Files use mode `0600`. The exporter preserves transcript bytes, including whitespace. The manifest records the original logical paths, modes, identities, byte counts, and SHA256 values.

The manifest states `available_records_only`. It preserves the producer's unavailable-history records. An archive does not establish that a provider retained every historical message.

The exporter writes `manifest.partial` before the producer seals its hash for each selected root. It preserves each receipt in `capture-receipt-N.json`. The result lists each receipt path, root ID, and exact byte hash. It renames the manifest to `manifest.json` after every receipt matches the capture and manifest. A failed read or seal leaves private partial files for the caller to handle.

## Proof boundary

The synthetic fixtures exercise format selection, identity conflicts, byte hashes, private modes, and refusal paths. They do not establish process exclusion. Actual export requires the runtime producer and the original launch metadata. A host without that producer returns `consistency_unavailable`.
