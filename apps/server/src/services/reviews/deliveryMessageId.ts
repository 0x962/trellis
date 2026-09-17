// The identifier a review notification carries into the input ledger of the
// agent session. A resend raises `attempt`, so a later send gets its own
// identifier and an old receipt cannot confirm it.
export const deliveryMessageId = (delivery: { id: string; attempt: number }) =>
	`review-${delivery.id}-${delivery.attempt}`;
