# Personas

Personas are local records that Navid can create and edit across projects. Each persona has a name and an instruction.

The sidebar shows an AI section below Projects. Its Personas link opens `/ai/personas`.

## Outcomes

1. The Personas page lists saved personas and shows an empty state when the list is empty.
2. New persona opens a form with a Name field and a multiline Instruction field.
3. Both fields require text. The name permits 120 characters. The instruction permits 200,000 characters.
4. Create persona saves both fields in the local database. A fresh page load shows the saved persona.
5. Edit opens the saved fields. Save changes updates the same persona.
6. Cancel discards the form draft. A failed save retains the draft and shows an error.
7. The form prevents a second save while the first request is pending.
8. A failed list request shows an error and a Retry button.

The API exposes `personas.list`, `personas.create`, and `personas.update` through RPC and REST.
Each response includes `id`, `name`, `instruction`, `createdAt`, and `updatedAt`.
Mutations require the actor header, as other mutations do.

## Verification

The tests in `apps/web/src/routes/ai.personas.test.tsx` cover navigation, creation, edits, a fresh mount, validation, cancellation, and errors.
Service and procedure tests cover database writes, API validation, and actor requirements.
Choose verification based on the risk of the change. Performance tests are optional.
