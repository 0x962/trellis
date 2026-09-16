export function ActivityDot({ label }: { label: string }) {
	return (
		<span
			role="img"
			aria-label={label}
			className="absolute -right-1 -top-1 size-1.5 rounded-round bg-accent ring-2 ring-surface"
		/>
	);
}
