// The sizes that are not spacing: hit areas, marks, and strokes, in px.
export const layout = {
	// The smallest hit area on a phone.
	hit: 44,
	header: 44,
	statusIcon: 16,
	mark: 14,
	avatar: 18,
	liveDot: 7,
	bar: 3,
	tabIcon: 22,
	ribbon: { mini: 5, full: 6 },
	// One Needs you row and one section header. Every row shares the height,
	// so FlashList never measures one.
	inboxRow: 60,
	sectionHeader: 40,
	stroke: 1,
	ring: 1.5,
} as const;
