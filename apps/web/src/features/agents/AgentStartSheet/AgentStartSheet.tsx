import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, Select, Sheet } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

type Props = { ticket?: string; project?: string; onClose: () => void };
export function AgentStartSheet({ ticket, project: initialProject, onClose }: Props) {
	const { client, orpc, queryClient } = useApp();
	const [personaId, setPersonaId] = useState("");
	const [project, setProject] = useState(initialProject ?? "");
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {}, retry: false }));
	const projects = useQuery({ ...orpc.projects.list.queryOptions({ input: {} }), enabled: ticket === undefined });
	const choices =
		personas.data?.filter((persona) =>
			ticket === undefined ? persona.kind === "manager" : persona.kind !== "manager",
		) ?? [];
	const selected = choices.find((persona) => persona.id === personaId);
	const start = useMutation({
		mutationFn: () => client.agentRuns.start({ personaId, ...(ticket === undefined ? { project } : { ticket }) }),
		onSuccess: async (run) => {
			await queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			if (run.state === "running" || run.state === "interrupted") onClose();
		},
	});
	return (
		<Sheet
			open
			title={ticket === undefined ? "Start a manager" : "Assign a new agent"}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && !start.isPending && onClose()}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (selected && (ticket || project) && !start.isPending) start.mutate();
				}}
			>
				<div className="flex flex-1 flex-col gap-6 p-6 max-md:p-4">
					<p className="text-sm text-fg-muted">
						{ticket === undefined ? "Choose a project and a manager persona." : `Choose a persona for ${ticket}.`}{" "}
						Trellis gives the new agent a random name and starts it with your configured launch command.
					</p>
					{ticket === undefined && (
						<Select
							label="Project"
							placeholder="Select a project"
							value={project}
							onValueChange={setProject}
							items={(projects.data ?? [])
								.filter((item) => item.archivedAt === null)
								.map((item) => ({ value: item.path, label: `${item.path} · ${item.name}` }))}
							disabled={start.isPending || projects.isPending}
							className="w-full pointer-coarse:h-11"
						/>
					)}
					{personas.isError ? (
						<p role="alert" className="text-sm text-danger">
							Could not load personas.{" "}
							<Button variant="quiet" onClick={() => void personas.refetch()}>
								Retry
							</Button>
						</p>
					) : (
						<Select
							label="Persona"
							placeholder={personas.isPending ? "Load personas…" : "Select a persona"}
							value={personaId}
							onValueChange={setPersonaId}
							items={choices.map((persona) => ({ value: persona.id, label: persona.name }))}
							disabled={start.isPending || personas.isPending || choices.length === 0}
							className="w-full pointer-coarse:h-11"
						/>
					)}
					{!personas.isPending && !personas.isError && choices.length === 0 && (
						<p className="text-sm text-fg-muted">
							Create a {ticket === undefined ? "manager" : "builder or reviewer"} persona first.{" "}
							<Link to="/ai/personas" className="text-accent underline" onClick={onClose}>
								Open Personas
							</Link>
						</p>
					)}
					{selected && (
						<section aria-label="Persona instruction" className="flex flex-col gap-2">
							<h2 className="text-sm font-medium capitalize">{selected.kind} instruction</h2>
							<p className="whitespace-pre-wrap break-words border border-border bg-bg p-4 text-sm text-fg-muted">
								{selected.instruction}
							</p>
						</section>
					)}
					{projects.isError && ticket === undefined && (
						<p role="alert" className="text-sm text-danger">
							Could not load projects. {projects.error.message}
						</p>
					)}
					{start.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not start the agent. {start.error.message}
						</p>
					)}
					{start.data?.state === "failed" && (
						<p role="alert" className="text-sm text-danger">
							Could not start {start.data.name}. {start.data.error}
						</p>
					)}
				</div>
				<div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface p-4">
					<Button type="button" variant="quiet" disabled={start.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!selected || (!ticket && !project) || start.isPending}
						aria-busy={start.isPending}
					>
						{ticket === undefined ? "Start manager" : "Start agent"}
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
