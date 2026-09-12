import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Persona, PersonaKind } from "@trellis/api";
import { Button, EmptyState, EntityCard, IconButton, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { PersonaSheet } from "./components/PersonaSheet";
import { personaKinds } from "./kinds";

export function PersonasPage() {
	const { orpc } = useApp();
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {}, retry: false }));
	const [editor, setEditor] = useState<{ persona?: Persona; kind: PersonaKind } | null>(null);

	return (
		<>
			<Topbar
				actions={
					<IconButton
						label="New persona"
						icon={<Plus />}
						size="md"
						variant="primary"
						onClick={() => setEditor({ kind: "builder" })}
					/>
				}
			>
				<PageTitle title="Personas" />
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<div className="flex max-w-7xl flex-col gap-6">
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
						<EmptyState title="No personas yet" description="Create a persona to define its role and instruction." />
					) : (
						<div className="flex flex-col gap-8">
							{personaKinds.map((group) => {
								const members = personas.data.filter((persona) => persona.kind === group.value);
								return (
									<section key={group.value} aria-label={group.plural} className="flex flex-col gap-3">
										<header className="flex items-center gap-2">
											<h2 className="text-xl font-medium text-fg">{group.plural}</h2>
										</header>
										{members.length === 0 ? (
											<p className="border border-dashed border-border p-4 text-sm text-fg-faint">
												No {group.plural.toLowerCase()} yet. {group.description}
											</p>
										) : (
											<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
												{members.map((persona) => (
													<EntityCard
														key={persona.id}
														title={persona.name}
														description={persona.instruction}
														onEdit={() => setEditor({ persona, kind: persona.kind })}
													/>
												))}
											</div>
										)}
									</section>
								);
							})}
						</div>
					)}
				</div>
			</div>
			{editor !== null && <PersonaSheet persona={editor.persona} kind={editor.kind} onClose={() => setEditor(null)} />}
		</>
	);
}
