import type { HarnessCommands } from "./harnessCommands.ts";

const mapJson = (code: string) => `{{bun}} -e '${code}' --`;
const tmux = "tmux -S {{socket}} -f /dev/null";
const tmuxPlace = `${mapJson("console.log(JSON.stringify({workspaceId:process.argv[1],terminalId:process.argv[2]}))")} {{workDir}} {{id}}`;
const tmuxStart = `${tmux} new-session -d -s {{id}} -c {{workDir}} ';' set-option -t {{id}} remain-on-exit on ';' respawn-pane -k -t {{id}} {{agentCommand}}; ${tmuxPlace}`;

export const SUPERSET_HARNESS_COMMANDS: HarnessCommands = {
	start: `{{superset}} ws create {{target}} --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json | ${mapJson('const r=await Bun.stdin.json(); console.log(JSON.stringify({workspaceId:r.workspace.id,terminalId:r.terminals.find(t=>t.label==="Command").terminalId}))')}`,
	resume: `{{superset}} terminals create {{target}} --workspace {{workspaceId}} --command {{agentCommand}} --json | ${mapJson("const r=await Bun.stdin.json(); console.log(JSON.stringify({workspaceId:process.argv[1],terminalId:r.terminalId}))")} {{workspaceId}}`,
	healthcheck: `{{superset}} terminals list {{target}} --workspace {{workspaceId}} --json | ${mapJson('const r=await Bun.stdin.json(); const t=r.sessions.find(t=>t.terminalId===process.argv[1]); console.log(JSON.stringify({state:!t||t.exited?"exited":"running"}))')} {{terminalId}}`,
	send: "{{superset}} terminals send {{target}} --workspace {{workspaceId}} --terminal {{terminalId}} --text {{text}}",
	output:
		"{{superset}} terminals read {{target}} --workspace {{workspaceId}} --terminal {{terminalId}} --max-lines 200",
	stop: "{{superset}} terminals close {{target}} --workspace {{workspaceId}} --terminal {{terminalId}}",
	open: "{{superset}} ws open {{workspaceId}} --print {{target}}",
	recover: `trellis_workspace=$({{superset}} ws list {{target}} --json | ${mapJson("const r=await Bun.stdin.json(); console.log(r.find(w=>w.branch===process.argv[1]).id)")} {{branch}}); {{superset}} terminals list {{target}} --workspace "$trellis_workspace" --json | ${mapJson('const r=await Bun.stdin.json(); const t=r.sessions.find(t=>t.title==="Command"||t.title==="Agent"||t.title.includes(process.argv[2])); console.log(JSON.stringify({workspaceId:process.argv[1],terminalId:t.terminalId}))')} "$trellis_workspace" {{name}}`,
	projects: "{{superset}} projects list --json",
};

export const TMUX_HARNESS_COMMANDS: HarnessCommands = {
	start: tmuxStart,
	resume: `if ${tmux} has-session -t {{id}} 2>/dev/null; then ${tmux} kill-session -t {{id}}; fi; ${tmuxStart}`,
	healthcheck: `${tmux} display-message -p -t {{terminalId}} '#{pane_dead}' | ${mapJson('console.log(JSON.stringify({state:(await Bun.stdin.text()).trim()==="1"?"exited":"running"}))')}`,
	send: `printf '%s' {{text}} | ${tmux} load-buffer -b {{id}} -; ${tmux} paste-buffer -d -b {{id}} -t {{terminalId}} ';' send-keys -t {{terminalId}} Enter`,
	output: `${tmux} capture-pane -p -t {{terminalId}} -S -200`,
	stop: `${tmux} kill-session -t {{terminalId}}`,
	open: "printf ''",
	recover: `${tmux} has-session -t {{id}}; ${tmuxPlace}`,
	projects: "printf '[]'",
};
