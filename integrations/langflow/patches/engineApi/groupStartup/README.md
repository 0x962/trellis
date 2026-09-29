# Group scope startup registration

This fragment targets Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.
Apply the private engine API startup fragment first.
Apply the published review startup fragment second.
Apply this fragment after those two startup fragments.

The fragment adds `create_group_scope_router(security=security, open_session=session_scope)` to the existing private domain router list.
The shared engine router mounts its relative `/group-scopes` prefix under `/trellis-v1`.
The final read route is `POST /trellis-v1/group-scopes/read`.

The fragment calls `install_group_deadline_transport(origin=..., authentication_file=...)` inside `_install_outgoing_transports`.
The call uses the current per-instance native reservation origin and authentication file.
The startup resolves the private file before it installs any outgoing transport.
The startup installs all outgoing transports before service construction, recovery, or component execution.

This fragment changes no group business logic or author patch.
It does not supply the group deadline host callback.
It does not prove imports, route execution, credentials, deadlines, or runtime identity.
TRL-1156 owns the shared source assembly.
