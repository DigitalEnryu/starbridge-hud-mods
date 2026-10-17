# Fork changes

Forked from karanb192/cache-tax at 06cac47 (MIT, copyright kept in LICENSE).

## 2.2.1-fork.1 (2026-10-17)

- **Keep warm** button at the front of the band, OFF in every new session. ON arms keep-warm
  until it is clicked off, the session is cleared, or the app closes. It pings about every
  50 minutes of idle, only while the cache is still warm.
- The band is always drawn (upstream hid it while keep-warm was off) and shows pings sent and
  their estimated cost.
- Removed the 3-hour auto-arm after a cold write, so OFF really means off. The log line now
  points at the button instead.
- `/keepwarm` and `/cache-tax` still work as typed commands.
- Fix: the band now appears in desktop app sessions. They start before their surface attaches,
  so upstream's `session.start` check saw no surface and fell back to the status line forever.
- Tests: 8 upstream tests that assert the old behaviour are kept for the diff but not run
  (`superseded(...)` in `tests/register.test.ts`); 4 fork tests added at the end of that file.
