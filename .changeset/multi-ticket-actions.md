---
"@trellis/api": minor
"@trellis/server": minor
"@trellis/cli": minor
"@trellis/ui": minor
"@trellis/web": minor
---

Act on many tickets at once. With tickets selected in the table or on the board, the status, priority, parent, project, label, epic, copy, and delete keys change every selected ticket, and the command palette lists the same actions. The board selects cards of one column. A write over more than 25 tickets asks first, and a write over more than 200 goes out in runs of 200. `tickets.updateMany` refuses a ticket named twice, and `force` leaves `tickets.create`, `tickets.move`, and `tickets.updateMany`, which never read it.
