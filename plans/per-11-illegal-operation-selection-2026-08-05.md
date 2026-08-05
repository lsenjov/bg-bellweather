# PER-11 illegal operation selection

## Goal

Reject player-selected operation parameters that are illegal against the current board, preserve the pending decision after rejection, and automatically fail the rest of a bid or delayed claim only when no legal choice remains.

## Steps

1. Add reusable operation-legality queries and focused unit coverage for every baseline family.
2. Filter pending decisions through current legality, reject illegal submissions without consuming cards, automatically record impossible cards and delayed claims as failed, and cover the resolution and server error paths.
3. Use the legality queries to constrain the web operation form, archive and replace the superseded rule wording, record the committed decision and changelog entry, and run the complete project checks.
4. Have a fresh agent review the implementation, fix every high or medium issue, report any low issues, and repeat review until no high or medium findings remain.
