// The agent mark from the mockup: a rounded head with an antenna and two eyes.
// It is decorative; the Avatar that holds it carries the name.
export function BotGlyph() {
	return (
		<svg
			data-glyph="bot"
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2.2}
			strokeLinecap="round"
			strokeLinejoin="round"
			className="size-2.75"
		>
			<path d="M12 3v3M8 20v-3M16 20v-3" />
			<rect x="4" y="6" width="16" height="11" rx="3" />
			<path d="M9 11.5h.01M15 11.5h.01" />
		</svg>
	);
}
