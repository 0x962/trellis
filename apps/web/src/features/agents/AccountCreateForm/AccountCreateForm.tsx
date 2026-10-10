import { useMutation } from "@tanstack/react-query";
import type { AccountHarness, HarnessAccount, HarnessAccountCreate } from "@trellis/api";
import { HarnessAccountForm } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { useApp } from "../../../lib/appContext";

export function AccountCreateForm({
	name,
	harness,
	scope,
	onCreated,
	onClose,
}: {
	name: string;
	harness: AccountHarness;
	scope?: string;
	onCreated: (account: HarnessAccount) => void;
	onClose: () => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const generation = useRef(0);
	const active = useRef(false);
	const identity = JSON.stringify([name, harness, scope]);
	const previousIdentity = useRef(identity);
	if (identity !== previousIdentity.current) {
		previousIdentity.current = identity;
		generation.current++;
	}
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	const create = useMutation({
		mutationFn: ({ input }: { input: HarnessAccountCreate; generation: number }) =>
			client.harnessAccounts.create(input),
		onSuccess: async (account, request) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.harnessAccounts.list.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.usage.accounts.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.usage.report.key() }),
			]);
			if (request.generation === generation.current) onCreated(account);
		},
		onSettled: () => {
			active.current = false;
		},
	});
	return (
		<HarnessAccountForm
			open
			initialName={name}
			initialHarness={harness}
			lockHarness
			busy={create.isPending}
			error={create.variables?.generation === generation.current ? create.error?.message : undefined}
			onClose={() => {
				generation.current++;
				onClose();
			}}
			onSubmit={(input) => {
				if (active.current) return;
				active.current = true;
				create.mutate({ input, generation: generation.current });
			}}
		/>
	);
}
