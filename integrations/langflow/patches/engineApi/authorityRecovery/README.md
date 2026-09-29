# Controlled initial authority recovery

This fragment adds `POST /trellis-v1/authority/recover-initial`. The route restores an archived first authority as history and installs its exact successor as the current authority.

The common engine bearer protects the route. The route also requires `X-Trellis-Authority-Recovery-Issuer`. Startup reads that separate credential from `TRELLIS_AUTHORITY_RECOVERY_ISSUER_FILE`.

The request preserves these original strings:

- `originalAuthorityBytes`
- `initialRecordBytes`
- `successorCommitBytes`

The engine validates the archived epoch 1 authority, the closed correlation, the successor transition, the held permit, and the current instance. A changed owner requires the exact revocation and the retained stop record. A same-owner renewal requires an expired predecessor. Both paths keep admission closed.

The transaction locks the Job row before the authority and recovery rows. It writes the successor authority and the immutable recovery record in that transaction. It writes no queue item, signal, admission receipt, or outbox row.

Migration `ae2b4f7d509c` follows authority migration `9d1a3e6c4f8b`. The recovery record retains the exact request, predecessor, initial record, successor commit, successor authority, and response. An exact replay returns the first response. Changed request bytes under the same request identifier return a conflict.

The startup hunk uses the current review startup checkpoint. The final assembler must also preserve the reconciliation startup hunk. Missing explicit engine configuration keeps the private API inactive. A missing issuer file causes configured startup to fail.

The source includes transaction and authentication fixtures. These fixtures have not run. Migration application, combined imports, runtime recovery, Review, and activation remain unverified.
