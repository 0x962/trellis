import { ArrowClockwise, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Role } from "@trellis/api";
import { EmptyState, EntityCard, FailureState, IconButton, Skeleton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { usePageCreate } from "../../../lib/usePageCreate";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { RoleSheet } from "./components/RoleSheet";

export function RolesPage() {
	const { orpc } = useApp();
	const roles = useQuery(orpc.roles.list.queryOptions({ input: {}, retry: false }));
	const [editor, setEditor] = useState<{ role?: Role } | null>(null);
	const createRole = () => setEditor({});
	usePageCreate(createRole);
	return (
		<>
			<Topbar
				actions={
					<Tooltip content="New role">
						<TopbarActionButton label="New role" icon={<Plus />} onClick={createRole} />
					</Tooltip>
				}
			>
				<PageTitle title="Roles" />
			</Topbar>
			<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				{roles.isPending ? (
					<div role="status" aria-label="Load roles">
						<Skeleton lines={3} />
					</div>
				) : roles.isError ? (
					<FailureState
						title="Could not load roles"
						detail={roles.error.message}
						action={
							<Tooltip content="Retry">
								<IconButton
									label="Retry"
									icon={<ArrowClockwise />}
									disabled={roles.isFetching}
									onClick={() => void roles.refetch()}
								/>
							</Tooltip>
						}
					/>
				) : roles.data.length === 0 ? (
					<EmptyState title="No roles yet" description="Create a role with a name and Markdown body." />
				) : (
					<div className="grid max-w-7xl grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
						{roles.data.map((role) => (
							<EntityCard
								key={role.id}
								title={role.name}
								description={role.body}
								editLabel={`Edit ${role.name}`}
								onEdit={() => setEditor({ role })}
							/>
						))}
					</div>
				)}
			</div>
			{editor !== null && <RoleSheet role={editor.role} onClose={() => setEditor(null)} />}
		</>
	);
}
