# Shared private engine API

This fragment adds the common private API security, current delivery authority, and authenticated health route to the pinned Langflow source.
TRL-674 applies it after the publication fragment.
The authority migration is `9d1a3e6c4f8b`, after publication migration `8c0f2d5b3e7a`.

`EngineApiSecurity(authentication_file, identity)` reads one mode-0600 bearer file at startup.
`require_transport_auth` compares its exact text with the request bearer.
`load_engine_api_identity()` reads the immutable container identity references.
`create_engine_api_router(security, authority_session, domain_routers)` mounts one `/trellis-v1` root.
Domain routers use relative prefixes.

`commit_authority` stores the original UTF-8 `authorityBytes` and its SHA256 digest.
A renewal keeps the owner and epoch, and advances the ownership revision by one.
A takeover requires prior revocation, a new owner, the next epoch, and the next ownership revision.
The takeover clears the prior revocation in the same transaction.
`read_authority` returns the exact bytes and revocation state for read-only recovery.

A domain handler locks its job row before it calls `require_authority` with the same `AsyncSession`.
The authority function then locks the exact execution authority row.
It checks the execution, publication, engine job, permission, expiry, current digest, and exact bytes before the domain write.
No separate request or database session grants authority.

`execution.cancel` remains valid after owner revocation until the exact saved grant expires.
This exception lets a committed stop close work from the revoked owner.
Every other permission fails after revocation.
A successor grant makes the old cancellation authority stale.
`review.classify` authorizes classification for the exact saved execution, publication, job, and current capability.
It does not authorize native reservation.
`classification.deliver` authorizes the separate result delivery for the same exact identities.
Neither classification permission grants the other action.

The fragment also adds `LANGFLOW_SECRET_KEY_FILE` to the pinned `AuthSettings` boundary.
The sidecar mounts the generated engine secret from a read-only Docker volume.
The secret value does not enter the process arguments, environment, Docker labels, or logs.

The focused Python fixture covers exact bytes, renewal, revoke-before-takeover, stale-owner refusal, successor acceptance, and cancellation after revocation.
The fixture remains unrun under the host capacity hold.
Candidate SQLite locking, domain integration, container isolation, restart data, and installed behavior remain unproved.

```sh
python integrations/langflow/patches/engineApi/shared/buildPatch.py /path/to/pinned/langflow
```
