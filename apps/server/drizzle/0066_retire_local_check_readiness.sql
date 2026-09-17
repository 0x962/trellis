UPDATE "personas" SET "instruction" = replace("instruction",
'If a required check fails or remains unrun, keep the ticket out of Agent Review even when evidence reports readyForReview.',
'If a required check fails or remains unrun, keep the ticket out of Agent Review.'), "updated_at" = now()
WHERE position('If a required check fails or remains unrun, keep the ticket out of Agent Review even when evidence reports readyForReview.' IN "instruction") > 0;
