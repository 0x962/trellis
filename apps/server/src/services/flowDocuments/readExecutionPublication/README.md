# Retained execution publication

`readExecutionPublication(execution)` accepts the row from `lockExecution` in the caller's transaction.
It returns `{publication, snapshot, graphDocument}` from that execution.
The execution retains these records after deletion of its source flow.

The reader checks the digest of the original submission bytes and their parsed publication and snapshot.
It also checks the execution, flow, publication, revision, document hash, and component manifest identities.
The engine publication ledger owns the original document bytes and their hash verification.

Consumers validate their own node schemas, conversion provenance, and engine checkpoint associations.
Native reservation derives its task key from the static base and the complete approved occurrence tuple.
The authenticated caller checks current authority and admission before an effect.
