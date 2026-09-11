# Personas

Personas are local records that Navid can create and edit across projects. Each persona has a name, an instruction, and a kind: builder, reviewer, or manager.

The sidebar shows an AI section below Projects. Its Personas link opens `/ai/personas`.

## Outcomes

1. The Personas page shows saved personas as cards grouped by kind and shows an empty state when the list is empty.
2. New persona opens a slideout with Name, Kind, and multiline Instruction fields.
3. Both fields require text. The name permits 120 characters. The instruction permits 200,000 characters.
4. Create persona saves all fields in the local database. A fresh page load shows the saved persona.
5. Edit opens the saved fields. Save changes updates the same persona.
6. Cancel discards the form draft. A failed save retains the draft and shows an error.
7. The form prevents a second save while the first request is pending.
8. Delete requires confirmation inside the slideout. A failed delete keeps the persona and the editor.
9. Existing personas retain their instructions and receive the reviewer kind. New personas default to builder.
10. A failed list request shows an error and a Retry button.

The API exposes `personas.list`, `personas.create`, `personas.update`, and `personas.delete` through RPC and REST.
Each response includes `id`, `name`, `kind`, `instruction`, `createdAt`, and `updatedAt`.
Mutations require the actor header, as other mutations do.

## Verification

The tests in `apps/web/src/routes/ai.personas.test.tsx` cover navigation, creation, edits, a fresh mount, validation, cancellation, and errors.
Service and procedure tests cover database writes, API validation, and actor requirements.
Choose verification based on the risk of the change. Performance tests are optional.
