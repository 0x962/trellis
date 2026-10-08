# Retained document tables

These declarations preserve tables from applied migrations.
Existing databases retain their records and constraints.
Migration 0139 also uses these tables for actor identity constraints.
Keep the declarations aligned with the migration snapshots to prevent accidental table deletion.
The native flow services use the original flow tables.

```mermaid
erDiagram
    flows ||--o{ langflow_document_revisions : preserves
    flows ||--o{ langflow_document_conversions : retains
    langflow_document_revisions ||--o| langflow_document_publications : binds
    langflow_document_revisions ||--o{ langflow_document_save_receipts : acknowledges
    langflow_document_revisions ||--|| langflow_document_publication_states : reports
    flows {
        text id PK
        text project_id FK
        integer version
    }
    langflow_document_revisions {
        text flow_id PK,FK
        integer revision PK
        text document_hash
        text component_manifest_hash
        bytea source_bytes
        jsonb snapshot
        timestamptz saved_at
    }
    langflow_document_publications {
        text publication_id PK
        text flow_id FK
        integer revision FK
        text document_hash FK
        text component_manifest_hash FK
        jsonb publication
    }
    langflow_document_save_receipts {
        text flow_id PK,FK
        uuid request_id PK
        bytea request_bytes
        text request_hash
        integer revision FK
        jsonb receipt
    }
    langflow_document_publication_states {
        text flow_id PK,FK
        integer revision PK,FK
        integer version
        jsonb state
    }
    langflow_document_conversions {
        text migration_id PK
        text flow_id FK
        integer source_version
        text source_document_hash
        bytea source_bytes
        jsonb provenance
    }
```
