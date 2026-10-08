import { ORPCError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	type Provider,
	ProviderCreateInputSchema,
	ProviderModelIdSchema,
	ProviderUpdateInputSchema,
} from "@trellis/api";
import { ProviderForm, ProviderModelsPicker } from "@trellis/ui";
import { type ComponentProps, useRef, useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { accountError } from "../../../UsageAccounts/accountError";
import {
	initialProviderValue,
	providerCheckInput,
	providerCredentialsChanged,
	providerFormDirty,
	providerFormInput,
} from "../../providerFormInput";

export function UsageProviderForm({
	provider,
	onClose,
	onSaved,
	finalFocus,
}: {
	provider?: Provider;
	onClose: () => void;
	onSaved: (provider: Provider, created: boolean) => Promise<void>;
	finalFocus: ComponentProps<typeof ProviderForm>["finalFocus"];
}) {
	const { client, orpc, queryClient } = useApp();
	const [value, setValue] = useState(() => initialProviderValue(provider));
	const input = providerFormInput(value, provider);
	const credentialsVersion = useRef(0);
	const checkInput = providerCheckInput(value, provider);
	const check = useMutation({
		gcTime: 0,
		mutationFn: async () => {
			const version = credentialsVersion.current;
			const target = checkInput!;
			const result = await (target.source === "stored"
				? client.providers.check(target.input)
				: client.providers.checkDraft(target.input));
			return { version, result };
		},
	});
	const checked = check.data?.version === credentialsVersion.current ? check.data.result : undefined;
	const options = provider
		? orpc.providers.models.queryOptions({ input: { id: provider.id } })
		: orpc.providers.publicModels.queryOptions({ input: { kind: value.kind } });
	const catalog = useQuery({
		...options,
		enabled: Boolean(provider) || value.kind === "vercel-ai-gateway",
		staleTime: 5 * 60_000,
	});
	const refresh = useMutation({
		mutationFn: async () => {
			const queryKey = options.queryKey;
			const result = await (provider
				? client.providers.models({ id: provider.id, refresh: true })
				: client.providers.publicModels({ kind: value.kind, refresh: true }));
			return { queryKey, result };
		},
		onSuccess: ({ queryKey, result }) => queryClient.setQueryData(queryKey, result),
	});
	const save = useMutation({
		mutationFn: () =>
			provider
				? client.providers.update(ProviderUpdateInputSchema.parse(input.data))
				: client.providers.create(ProviderCreateInputSchema.parse(input.data)),
		onSuccess: async (result) => {
			onClose();
			await onSaved(result, !provider);
		},
	});
	const errorField =
		save.error instanceof ORPCError && save.error.code === "INPUT_VALIDATION_FAILED"
			? String((save.error.data as { issues: { path?: (string | number)[] }[] }).issues[0]?.path?.[0] ?? "")
			: save.error instanceof ORPCError && save.error.code === "DUPLICATE"
				? "name"
				: undefined;
	return (
		<ProviderForm
			open
			value={value}
			onChange={(next) => {
				if (providerCredentialsChanged(value, next)) {
					credentialsVersion.current += 1;
					check.reset();
				}
				setValue(next);
			}}
			editing={Boolean(provider)}
			keyLast4={provider?.keyLast4}
			busy={save.isPending}
			valid={
				input.success && checked?.ok === true && !check.isPending && (!provider || providerFormDirty(value, provider))
			}
			check={{
				pending: check.isPending,
				canCheck: checkInput !== undefined,
				result: checked,
				error: accountError(check.error),
				hint:
					provider && value.apiKey.trim() === "" && value.baseUrl.trim() !== provider.baseUrl
						? "Enter the API key to check the new address."
						: undefined,
				onCheck: () => check.mutate(),
			}}
			error={accountError(save.error)}
			errorField={errorField}
			onClose={onClose}
			finalFocus={finalFocus}
			onSubmit={() => save.mutate()}
			models={(id) => (
				<ProviderModelsPicker
					id={id}
					value={value.models}
					onChange={(models) => setValue({ ...value, models })}
					models={catalog.data?.models ?? []}
					detail={accountError(refresh.error ?? catalog.error) ?? catalog.data?.detail}
					fetchedAt={catalog.data?.fetchedAt}
					pending={catalog.isFetching || refresh.isPending}
					disabled={save.isPending}
					typedOnly={value.kind === "openai-compatible" && (!provider || catalog.data?.models.length === 0)}
					validId={(model) => ProviderModelIdSchema.safeParse(model).success}
					onRefresh={() => refresh.mutate()}
				/>
			)}
		/>
	);
}
