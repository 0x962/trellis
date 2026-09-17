DROP TABLE "evidence_artifacts" CASCADE;--> statement-breakpoint
DROP TABLE "evidence_checks" CASCADE;--> statement-breakpoint
UPDATE "personas"
SET "instruction" = replace(
	replace(
		replace(
			replace(
				replace(
					replace(
						replace(
							replace(
								"instruction",
								'Keep each note short. Include evidence and the consequence for future work. Never include credentials.',
								'Keep each note short. Include the fact and the consequence for future work. Never include credentials.'
							),
							'Record the result and relevant evidence in a ticket comment.',
							'Record the result in a ticket comment.'
						),
						'Include enough context or evidence for another agent to use the note.',
						'Include enough context for another agent to use the note.'
					),
					'Keep comments concise. Link the relevant pull request or evidence.',
					'Keep comments concise. Link the relevant pull request.'
				),
				'Keep a note short: the fact, the evidence, and what the reader must do.',
				'Keep a note short: the fact and what the reader must do.'
			),
			'Report outcomes, evidence, and decisions that need human input.',
			'Report outcomes and decisions that need human input.'
		),
		'test evidence',
		'test results'
	),
	'evidence',
	'details'
)
WHERE lower("instruction") LIKE '%evidence%';
