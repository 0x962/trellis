// The seed the fake server starts with. It is the data the reference screens
// show, so a screenshot of the shell over the fake server matches the
// approved screens. The contract tests under test/fake-server assert
// these facts.
//
// Actors: navid (human), claude-code (agent), codex (agent).
//
// Projects and open counts (open = category not done or canceled):
//   CDE "Superset CDE"   31 open in the subtree, 12 in CDE itself
//   CDE.web "web"        12 open
//   CDE.host "host"       7 open
//   TRL "trellis"        14 open
//   MRG "margin"          3 open
// Every root owns the six default statuses in this order: Todo (todo,
// default), In Progress (started), Agent Review (review, agent), Human
// Review (review, human), Done (done), Canceled (canceled). The slugs are
// todo, in-progress, agent-review, human-review, done, canceled. Sub-projects
// inherit CDE's set.
//
// CDE subtree totals: 31 open, 19 done, 2 canceled (52 rows). By status:
// todo 23, in-progress 4, agent-review 2, human-review 2, done 19, canceled 2.
// TRL: 14 open, 5 done. MRG: 3 open, 2 done.
//
// Named tickets, newest activity first inside each project:
//   CDE.web  CDE-42 "Restore the fork pages after the upstream 1.27 merge"
//            human-review, high, parent CDE-43, 4 comments, 1 attachment,
//            children CDE-48 (done), CDE-49 (done), CDE-50 (todo),
//            PR canary-technologies-corp/de #118 open, approved, checks
//            lint, typecheck (desktop), test (host-service), build
//            (macos-arm64) all pass; last actor claude-code 2 h ago;
//            in Human Review for 1 day.
//   CDE.web  CDE-44 "Terminal pane loses scrollback on session handoff"
//            in-progress, urgent, 2 comments, PR de #121 open, checks lint
//            pass, typecheck (desktop) fail, test (host-service) pass, build
//            (macos-arm64) pending; claude-code 9 min ago.
//   CDE.web  CDE-41 "Local Stack tab reads the live checkout from tmux"
//            in-progress, medium, parent CDE-43, 1 attachment; claude-code 3 h.
//   CDE.web  CDE-38 "Databases page: cancel button for long statements"
//            in-progress, medium; claude-code 2 days ago (stalled).
//   CDE.web  CDE-37 "Shell+ tabs survive an app restart" human-review,
//            medium, 2 comments, PR de #115 open, 4 checks pass; codex 5 h;
//            in Human Review for 12 h.
//   CDE.web  CDE-48, CDE-49 done today by claude-code (3 h, 2 h); CDE-50 todo.
//   CDE.web  CDE-51 "Refresh the OAuth token before the gh poller runs" todo, high.
//   CDE.host CDE-45 "Setup module skips a hand-run launchd agent"
//            agent-review, high, PR de #119 open, 4 checks pass; claude-code 14 min.
//   CDE.host CDE-40 "Agent wrapper skips its own ~/.golemapp spelling"
//            agent-review, medium, 1 comment, PR de #117 open, checks pass,
//            pass, skipping, pass; codex 6 h.
//   CDE      CDE-43 "Merge upstream 1.27 and keep every marked site"
//            in-progress, high, PR de #116 open, 4 checks pending; navid 41 min.
//   CDE      CDE-47 "Shell+ tab rename by double click" todo, low, 2 attachments.
//   CDE      CDE-39 "Local Stack: stop the running checkout before a new one
//            starts" todo, medium, parent CDE-43.
//   CDE      CDE-36 "Terminals page: reopen a dead shell in the same directory" todo, low.
//   CDE      CDE-35 "Databases page: keep the server's time zone on timestamptz" todo, none.
//   CDE      CDE-46 "Notices: the version feed guard for the fork build" todo, medium.
//   TRL      TRL-9 "PR polling: one batched GraphQL query or per-PR REST calls"
//            human-review, low, parent TRL-4; claude-code 1 day; in Human Review for 6 h.
//   TRL      TRL-4 "PR and CI polling" in-progress, medium; navid 20 h.
//   TRL      TRL-12 "OAuth device flow for the CLI sign-in" todo, urgent.
import { addChild, addRoot, claude, codex, createSeeder, day, hour, minute, navid } from "./seeder";
import { seedFillers } from "./seedFillers";
import { seedNamed } from "./seedNamed";
import { createState, type ProjectRow, type State, touchActor } from "./state";

export type Roots = { cde: ProjectRow; web: ProjectRow; host: ProjectRow; trl: ProjectRow; mrg: ProjectRow };

const seedActors = (state: State, now: number) => {
	const ago = (ms: number) => new Date(now - ms).toISOString();
	touchActor(state, navid, ago(30 * day));
	touchActor(state, claude, ago(28 * day));
	touchActor(state, codex, ago(20 * day));
	state.actors.get("human:navid")!.lastSeenAt = ago(41 * minute);
	state.actors.get("agent:claude-code")!.lastSeenAt = ago(9 * minute);
	state.actors.get("agent:codex")!.lastSeenAt = ago(5 * hour);
};

// Only the actors and the settings. The setup flow starts here.
export const createEmptyState = (now: number): State => {
	const state = createState();
	seedActors(state, now);
	return state;
};

export const seedState = (now: number): State => {
	const state = createEmptyState(now);
	state.defaultActorStored = true;
	const at = new Date(now - 30 * day).toISOString();
	const cde = addRoot(state, "CDE", "Superset CDE", 0, at);
	const web = addChild(state, cde, "web", "web", 0, at);
	const host = addChild(state, cde, "host", "host", 1, at);
	const trl = addRoot(state, "TRL", "trellis", 1, at);
	const mrg = addRoot(state, "MRG", "margin", 2, at);
	const seeder = createSeeder(state, now);
	seedNamed(seeder, { cde, web, host, trl, mrg });
	seedFillers(seeder, { cde, web, host, trl, mrg });
	return state;
};
