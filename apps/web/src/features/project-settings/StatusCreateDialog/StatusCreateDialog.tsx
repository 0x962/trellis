import type { Status } from "@trellis/api";
import { Dialog } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { StatusCreateForm } from "../StatusCreateForm";

export function StatusCreateDialog({
	project,
	scope,
	initialName,
	onCreated,
	onClose,
}: {
	project: string;
	scope?: string;
	initialName: string;
	onCreated: (status: Status) => void;
	onClose: () => void;
}) {
	const { orpc, queryClient } = useApp();
	const [busy, setBusy] = useState(false);
	const generation = useRef(0);
	const createScope = JSON.stringify([project, scope]);
	const previousScope = useRef(createScope);
	const submitted = useRef<number | null>(null);
	if (previousScope.current !== createScope) {
		previousScope.current = createScope;
		generation.current++;
	}
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	return (
		<Dialog open title="Create status" onOpenChange={(open) => !open && !busy && onClose()}>
			<StatusCreateForm
				project={project}
				initialName={initialName}
				busy={busy}
				onWrite={async (operation) => {
					if (submitted.current !== null) return;
					submitted.current = generation.current;
					setBusy(true);
					await operation().finally(() => {
						submitted.current = null;
						setBusy(false);
					});
				}}
				onCreated={async (status) => {
					const attempt = submitted.current;
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: orpc.statuses.key() }),
						queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
					]);
					if (attempt === generation.current) onCreated(status);
				}}
				onCancel={onClose}
			/>
		</Dialog>
	);
}
