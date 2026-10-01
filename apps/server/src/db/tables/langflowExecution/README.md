# Retained execution tables

These declarations preserve tables from applied migrations.
Existing databases retain their records and constraints.
Migration 0139 also uses these tables for actor identity constraints.
Keep the declarations aligned with the migration snapshots to prevent accidental table deletion.
The native flow services use the original flow tables.

```mermaid
erDiagram
    tickets ||--o{ langflow_executions : owns
    projects ||--o{ langflow_executions : owns
    langflow_document_publications |o--o{ langflow_executions : catalog_link
    langflow_executions |o--o{ langflow_start_receipts : aliases
    flow_executions |o--o{ langflow_start_receipts : aliases
    langflow_executions ||--o{ langflow_warnings : delivers
    langflow_executions ||--o{ langflow_native_handles : reserves
    langflow_native_handles ||--o{ langflow_completions : retains
    langflow_executions ||--o{ langflow_decisions : records
    langflow_executions ||--o{ langflow_outbox : delivers
    langflow_executions ||--o{ langflow_ownership_receipts : transfers
    langflow_ownership_receipts ||--o| langflow_authority_commits : retains
    langflow_owner_fences {
        uuid id PK
        text_array owner_key UK
        jsonb revocation
    }
    langflow_executions ||--o{ langflow_stops : requires
    langflow_executions ||--o{ langflow_deadlines : retains
    langflow_executions ||--o| langflow_execution_projections : projects
    langflow_executions ||--o{ langflow_source_events : deduplicates
    langflow_executions ||--o| langflow_classifications : classifies
```
