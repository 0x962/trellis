import type { Note, NoteAudience, StoredActorKind } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso } from "../../db/queries/support.ts";

export type RawNote = {
	id: string;
	project_id: string;
	title: string;
	body: string;
	audience: NoteAudience;
	expires_at: string | null;
	actor_name: string;
	actor_kind: StoredActorKind;
	actor_display_name: string | null;
	created_at: string;
	updated_at: string;
};

// An agent actor is `agent:<run id>`, and the run names the persona, which
// is the name a reader knows the agent by.
export const noteSelect = sql`SELECT n.id, n.project_id, n.title, n.body, n.audience, ${iso(sql`n.expires_at`)} AS expires_at,
	n.actor_name, n.actor_kind, r.persona_name AS actor_display_name,
	${iso(sql`n.created_at`)} AS created_at, ${iso(sql`n.updated_at`)} AS updated_at
	FROM notes n LEFT JOIN agent_runs r ON n.actor_kind = 'agent' AND r.id = n.actor_name`;

export const toNote = (row: RawNote, projectPath: string): Note => ({
	id: row.id,
	projectId: row.project_id,
	projectPath,
	title: row.title,
	body: row.body,
	audience: row.audience,
	expiresAt: row.expires_at,
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});
