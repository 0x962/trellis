import { useQuery } from "@tanstack/react-query";
import type { Persona } from "@trellis/api";
import { Button, EmptyState, IconButton, Skeleton } from "@trellis/ui";
import { Pencil, Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { Topbar } from "../../shell/Topbar";
import { PersonaDialog } from "./components/PersonaDialog";

export function PersonasPage() {
	const { orpc } = useApp();
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {}, retry: false }));
	const [editor, setEditor] = useState<{ persona?: Persona } | null>(null);

	return (
		<>
			<Topbar
				actions={
					<Button variant="primary" icon={<Plus />} onClick={() => setEditor({})}>
						New persona
					</Button>
				}
			>
				<h1 className="text-md font-semibold text-fg">Personas</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<div className="flex max-w-3xl flex-col gap-6">
					<p className="text-sm text-fg-muted">Give each persona a name and an instruction.</p>
					{personas.isPending ? (
						<div role="status" aria-label="Load personas" className="flex flex-col gap-3">
							<span className="sr-only">Load personas</span>
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-24 w-full" />
						</div>
					) : personas.isError ? (
						<div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
							<p className="text-sm text-danger">Could not load personas.</p>
							<Button disabled={personas.isFetching} onClick={() => void personas.refetch()}>
								Retry
							</Button>
						</div>
					) : personas.data.length === 0 ? (
						<EmptyState
							icon={<UserRound />}
							title="No personas yet"
							description="Create a persona to define its role and instruction."
						/>
					) : (
						<ul
							aria-label="Personas"
							className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
						>
							{personas.data.map((persona) => (
								<li key={persona.id} className="flex items-start gap-4 p-4">
									<div className="min-w-0 flex-1">
										<h2 className="break-words text-md font-medium text-fg">{persona.name}</h2>
										<p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-fg-muted">
											{persona.instruction}
										</p>
									</div>
									<IconButton label={`Edit ${persona.name}`} icon={<Pencil />} onClick={() => setEditor({ persona })} />
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
			{editor !== null && <PersonaDialog persona={editor.persona} onClose={() => setEditor(null)} />}
		</>
	);
}
