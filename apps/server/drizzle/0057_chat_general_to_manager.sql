UPDATE "personas" SET "instruction" = replace("instruction",
'Every live agent and manager of the project receives each post.',
'A post in #general with no mention reaches the manager only. A post in any other channel reaches every live agent and manager of the project. Every delivery carries the recent messages of its channel, so read them before you answer.'), "updated_at" = now()
WHERE position('Every live agent and manager of the project receives each post.' IN "instruction") > 0;
