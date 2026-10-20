# Data safety rules (internal, not shown to students)

Permanent rule from the owner: updates must never wipe or lose any user's data
(accounts, attempts, mocks, progress, streaks, bookmarks, settings).

1. Schema and data changes are additive and backward compatible only.
2. Take a backup (copy tables) before any destructive step.
3. Never delete or rename a table or column that holds user data without a migration that keeps the data.
4. Never drop or re-id a question that has attempts without telling the owner first. Attempts must stay valid.
5. localStorage progress is versioned and migrated, never reset.
6. Cache-bust and version reloads must not clear localStorage, sessionStorage or auth tokens.
7. Test an upgrade with the existing test account (login, attempts, unfinished mocks still there) before pushing.
8. Keep rollback commit SHAs for every push.
