import { FailureState } from "../../../../domain/FailureState";
import { Button } from "../../../../primitives/Button";
import { Section } from "../../Section";

// The line that the session page showed before TRL-405: the path of the
// node binary inside a release directory, and the code the process
// returned. It is the text that belongs behind the disclosure.
const exitLine =
	"Process /Users/nk/Library/Application Support/Trellis/releases/b726b5e389c7e3e7479934e480d5998249798477cca58accdd5685bbbecb8f15/bin/node exited with code 1";

// The rules that every failure in trellis follows. They are the same rules
// that the docstring of FailureState holds.
const rules = [
	"The title says what happened in plain words. It carries no code, no raw exception and no path.",
	"One line says what trellis does about it: it is trying again, it is waiting for the server, or it says nothing.",
	"One action, and at most two. The first action is the one that usually works.",
	"A failure that recovers by itself says so, and the screen clears it when the cause goes away.",
	"The detail a developer needs sits in a closed disclosure under the action, never in the title.",
	"No blame, no apology and no exclamation mark.",
];

export function FailureStateSection() {
	return (
		<Section
			name="FailureState"
			note="the one way trellis shows a failure: a process that stopped, a server that does not answer, a tab that threw; page, section and inline"
			className="flex-col items-stretch gap-6"
		>
			<ol className="ms-4 list-decimal text-sm text-fg-muted">
				{rules.map((rule) => (
					<li key={rule} className="py-0.5">
						{rule}
					</li>
				))}
			</ol>
			<div className="rounded-lg border border-border p-4">
				<FailureState
					variant="page"
					title="The agent stopped before it finished"
					description="Trellis keeps the workspace and every file in it. A new start opens a new agent in the same workspace."
					detail={exitLine}
					action={<Button size="md">Start the agent</Button>}
				/>
			</div>
			<div className="rounded-lg border border-border p-4">
				<FailureState
					variant="page"
					title="The server does not answer"
					description="The server at 127.0.0.1:4521 is offline."
					recovery="waiting"
					detail="TypeError: Failed to fetch"
					action={<Button size="md">Retry</Button>}
				/>
			</div>
			<div className="rounded-lg border border-border p-4">
				<FailureState
					variant="page"
					title="The check did not finish"
					description="The server holds the run of typecheck open."
					recovery="retrying"
					action={<Button size="md">Retry</Button>}
					secondAction={
						<Button size="md" variant="quiet">
							Open the run
						</Button>
					}
				/>
			</div>
			<div className="w-72 rounded-lg border border-border p-4">
				<FailureState
					variant="inline"
					title="Could not start the agent. The harness did not answer."
					action={
						<Button variant="quiet" className="-ml-2.5">
							Try again
						</Button>
					}
				/>
			</div>
			<div className="rounded-lg border border-border p-4">
				<FailureState
					title="This tab did not draw"
					description="The rest of the review still works."
					detail="Invalid hunk line counts in values.yaml"
					action={<Button size="md">Retry</Button>}
				/>
			</div>
		</Section>
	);
}
