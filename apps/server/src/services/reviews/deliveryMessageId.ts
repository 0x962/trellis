// The identifier a review notification carries into the input ledger of the
// agent session. The row id of the delivery names it, so a receipt in that
// ledger tells Trellis which delivery the agent got.
export const deliveryMessageId = (deliveryId: string) => `review-${deliveryId}`;
