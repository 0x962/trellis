import { type ModelProvider, ProviderIcon } from "../../../../domain/ProviderIcon";

export type AgentProfile = {
	provider: ModelProvider;
	model: string;
	effort?: string;
};

export function AgentProfileMark({ profile, working }: { profile: AgentProfile; working: boolean }) {
	return (
		<span
			aria-hidden="true"
			className="absolute top-0 left-0 z-20 flex h-full w-max max-w-full items-center overflow-hidden rounded-round border border-border bg-surface text-fg shadow-xs transition-[max-width,box-shadow] duration-hover ease-out group-hover/avatar:max-w-64 group-hover/avatar:shadow-lg motion-reduce:transition-none"
		>
			<span className="relative grid aspect-square h-full shrink-0 place-items-center">
				<ProviderIcon provider={profile.provider} decorative className="size-[55%]" />
				{working && <span className="absolute top-0 right-0 size-1.5 rounded-round border border-surface bg-accent" />}
			</span>
			<span className="flex max-w-0 min-w-0 -translate-x-1 items-center overflow-hidden pr-0 opacity-0 transition-[max-width,translate,opacity,padding] duration-hover ease-out group-hover/avatar:max-w-52 group-hover/avatar:translate-x-0 group-hover/avatar:pr-2 group-hover/avatar:opacity-100 motion-reduce:transition-none">
				<span className="truncate text-xs leading-none font-medium">{profile.model}</span>
				{profile.effort && (
					<>
						<span className="px-1 text-fg-faint">·</span>
						<span className="shrink-0 text-xs leading-none text-fg-muted">{profile.effort}</span>
					</>
				)}
			</span>
		</span>
	);
}
