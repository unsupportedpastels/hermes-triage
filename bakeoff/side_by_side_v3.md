## #123888 [issue_open] Desktop shows the first-run setup chooser on every start while the local install is healthy (Windows, PM install)
labels: ['type/bug', 'P2', 'needs-repro', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **deepseek-v4.1-flash** (None, None, None, conf None): Hermes Desktop on Windows shows the first-run setup chooser on every launch even though the local runtime is healthy, because backend resolution failures are silent and the bootstrap-needed gate ignores a verified local launcher.

## #123898 [issue_open] Telegram: responses rejected with send_path_degraded are never redelivered until restart (runtime sweep only wired to adapter reconnect)
labels: ['type/bug', 'comp/gateway', 'platform/telegram', 'P2', 'sweeper:risk-message-delivery']
- **deepseek-v4.1-flash** (None, None, None, conf None): Telegram responses rejected with send_path_degraded are never redelivered until gateway restart because the runtime redelivery sweep is only triggered on full adapter reconnect, not on the polling-generation degradation/recovery edge.

## #123685 [issue_open] Desktop: archiving a session resurrects it in the sidebar seconds later; clicking the ghost row fails with "Session owner could not be resolved"
labels: ['type/bug', 'duplicate', 'P3', 'sweeper:risk-session-state', 'comp/desktop', 'platform/windows', 'area/sessions']
- **deepseek-v4.1-flash** (None, None, None, conf None): Archiving a desktop session optimistically removes it from the sidebar, but an in-flight list refresh merges the stale pre-archive row back as a ghost with lost owner metadata, causing clicks to fail with a session-owner resolution error.

## #123989 [issue_open] [Bug]: Multiplex: API-server turns for different profiles share one Docker sandbox when their opening messages match
labels: ['type/bug', 'comp/gateway', 'tool/terminal', 'backend/docker', 'area/config', 'P2', 'sweeper:risk-session-state', 'sweeper:risk-message-delivery', 'sweeper:risk-security-boundary', 'bug', 'area/profiles']
- **deepseek-v4.1-flash** (None, None, None, conf None): On a multiplexed gateway, API-server turns for different profiles that share the same opening message derive the same session id and end up sharing one persistent Docker container, violating per-profile isolation.

## #123801 [issue_open] [Bug]: macOS Desktop renders duplicate assistant reply on d0288be5 despite one stored row and one completion
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **deepseek-v4.1-flash** (None, None, None, conf None): Hermes Desktop on macOS intermittently renders the same assistant reply twice even though the gateway persisted only one message row and emitted one completion, likely due to a history/live reconciliation identity mismatch between a timestamp-index-assistant root and an assistant-stream root.

## #123856 [issue_open] Desktop: stale-transcript guard never converges — repeated 'conversation is stale' refusals lock the user out of a long session
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **deepseek-v4.1-flash** (None, None, None, conf None): The desktop stale-transcript guard (refreshIfTranscriptStale) refuses every send in a long 302-message session with a 'conversation is stale' toast that never converges, permanently locking the user out of that session even after an app restart.

## #124006 [issue_open] [Bug]: `ultra` reasoning effort is sent unclamped on gpt-6 models, silencing the gateway with a non-retryable 400 (clamp gated on literal "gpt-5.6")
labels: ['type/bug', 'comp/agent', 'provider/openai', 'P2', 'sweeper:risk-compatibility']
- **deepseek-v4.1-flash** (None, None, None, conf None): The `ultra` reasoning effort is sent unclamped to Codex Responses on gpt-6 models because the clamp is gated on the literal `gpt-5.6`, causing non-retryable HTTP 400 errors and a silent gateway.

## #123787 [issue_open] [Bug]: Email attachments lose their filename when it has a space, ';' or non-ASCII characters
labels: ['type/bug', 'comp/plugins', 'platform/email', 'P3', 'sweeper:risk-message-delivery']
- **deepseek-v4.1-flash** (None, None, None, conf None): The email adapter's `_attach_file` builds the Content-Disposition header by string-interpolating the filename, so names containing spaces, semicolons, or non-ASCII characters are truncated or RFC 2047-encoded into an invalid header, causing attachments to lose their filename or not be recognized as attachments at all.

## #123971 [issue_open] Windows: hermes update always fails its post-relaunch gateway check (exit 1) when the Desktop started the gateway
labels: ['type/bug', 'comp/cli', 'comp/gateway', 'P2', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **deepseek-v4.1-flash** (None, None, None, conf None): On Windows, `hermes update` always exits 1 because the post-relaunch gateway verification cannot recognize a Desktop-started gateway whose command line uses an inline `python -c` bootstrap source, and the failed verification also unlinks the running gateway's identity files and re-spawns it on retry.

## #123768 [issue_open] Live compression config silently aborts on non-ContextCompressor context engines (`_coerce_threshold_tokens_cap`)
labels: ['type/bug', 'duplicate', 'comp/tui', 'comp/plugins', 'P3', 'sweeper:risk-session-state', 'area/compression']
- **deepseek-v4.1-flash** (None, None, None, conf None): Live compression config silently aborts on non-ContextCompressor context engines (`_coerce_threshold_tokens_cap`)

## #123781 [issue_open] [Bug]: `/skin MyTheme` answers "Unknown skin: mytheme" for a user skin with capitals in its name
labels: ['type/bug', 'comp/cli', 'P3']
- **deepseek-v4.1-flash** (None, None, None, conf None): The CLI `/skin <name>` command lowercases the argument before matching against available skins, so user-defined skins whose names contain uppercase letters (e.g. `MyTheme`) can never be selected.

## #123988 [issue_open] fix(tui_gateway): allocate file.attach uploads atomically
labels: ['type/bug', 'comp/tui', 'tool/file', 'P2', 'area/profiles']
- **deepseek-v4.1-flash** (None, None, None, conf None): The TUI gateway's file.attach upload path allocates attachment filenames with a non-atomic existence check followed by Path.write_bytes(), allowing concurrent same-name uploads to overwrite each other and leaving partial files behind on write failure.

## #123832 [issue_open] [Bug]: a tool call whose stream drops with no finish_reason runs on a repaired prefix (`timeout: 600` → `6`, a todo list cut short)
labels: ['type/bug', 'comp/agent', 'P1', 'area/streaming']
- **deepseek-v4.1-flash** (None, None, None, conf None): A tool call from a chat-completions stream that drops with no finish_reason has its truncated arguments silently repaired and executed on a guessed prefix instead of triggering the partial-stream retry.

## #123828 [issue_open] [Feature]: Component-scoped updates — let Desktop-only users skip the ui-tui and web build in `hermes update`
labels: ['type/feature', 'comp/cli', 'P3', 'sweeper:risk-compatibility', 'area/install-update']
- **deepseek-v4.1-flash** (None, None, None, conf None): `hermes update` unconditionally installs and builds the `ui-tui` and `web` workspaces with no config or CLI opt-out, forcing Desktop-only users to pay for frontends they never use.

## #120575 [issue_completed] [Feature]: One switch for binary settings — desktop configuration views mix Switch and SegmentedControl
labels: ['type/feature', 'P3', 'comp/desktop', 'comp/dashboard']
- **deepseek-v4.1-flash** (None, None, None, conf None): Desktop configuration views inconsistently render binary on/off settings using either the canonical Switch or SegmentedControl, and should be unified onto the existing Switch only for genuinely binary controls.

## #120580 [issue_completed] [Bug]: Desktop re-renders the previous turn's tools and final answer after a new reply when background review is superseded
labels: ['type/bug', 'P2', 'needs-repro', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **deepseek-v4.1-flash** (None, None, None, conf None): In the desktop app, when a new prompt interrupts a still-running background review from the previous turn, the transcript incorrectly re-renders the previous turn's tool activity and final answer below the new reply.

## #119809 [issue_completed] Windows: Desktop stops every profile's messaging gateway before an update but never restarts it on the success path
labels: ['type/bug', 'comp/gateway', 'P1', 'sweeper:risk-message-delivery', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **deepseek-v4.1-flash** (None, None, None, conf None): On Windows, the desktop app stops every profile's messaging gateway before an update hand-off but never restarts them on the success path, leaving all gateways down after a successful update.

## #121984 [issue_completed] [Bug]: a Desktop SSH backend (serve --isolated) is adopted by the host's own Desktop, misclassified by hermes update, and runs stale code after updates
labels: ['type/bug', 'backend/ssh', 'comp/cli', 'P2', 'sweeper:risk-compatibility', 'comp/desktop', 'area/install-update']
- **deepseek-v4.1-flash** (None, None, None, conf None): An SSH-isolated `hermes serve --isolated` backend started by a remote Hermes Desktop on machine B is misidentified as a local manual serve, letting B's Desktop attach to it and causing `hermes update` to misclassify, not restart, and leave it running stale code after updates.

## #119991 [issue_completed] [Bug]: Dashboard shows "not ready yet, try again" for a corrupt state.db and drops the server's `hermes doctor` instruction
labels: ['type/bug', 'P3', 'comp/dashboard']
- **deepseek-v4.1-flash** (None, None, None, conf None): The web dashboard discards the server's structured 503 error detail for a corrupt state.db and shows a generic 'not ready yet, try again' message instead of the actionable `hermes doctor` instruction.

## #120205 [issue_completed] Windows: foreign_state_db_holders() returns [] so the state.db write-guard / optimize-storage preflight is a silent no-op
labels: ['type/bug', 'comp/agent', 'comp/cli', 'P1', 'sweeper:risk-session-state', 'sweeper:risk-platform-windows', 'platform/windows', 'area/sessions']
- **deepseek-v4.1-flash** (None, None, None, conf None): On Windows, foreign_state_db_holders() unconditionally returns an empty list, making the state.db write-guard/optimize-storage preflight a silent no-op that allows maintenance to run while other processes hold the store.

## #122845 [issue_completed] __Hobson_permission_probe__
labels: ['invalid', 'comp/cli', 'P4']
- **deepseek-v4.1-flash** (None, None, None, conf None): A temporary permission probe issue was opened in the hermes-agent repository.

## #119961 [issue_completed] [Bug]: /compress here N in the default in-place mode drops the kept exchanges from state.db
labels: ['type/bug', 'comp/agent', 'P0', 'sweeper:risk-session-state', 'area/sessions', 'area/compression']
- **deepseek-v4.1-flash** (None, None, None, conf None): In the default in-place compression mode, `/compress here N` (and `up to here` / `--keep`) drops the N exchanges the user asked to keep from state.db, so both model and display histories lose them on resume or rebuild.

## #121347 [issue_completed] [Bug]: xai ignores model.base_url — request and XAI_API_KEY go to api.x.ai instead of the configured relay
labels: ['type/bug', 'comp/cli', 'provider/xai', 'area/config', 'P2']
- **deepseek-v4.1-flash** (None, None, None, conf None): The xai provider ignores a configured model.base_url and sends requests plus XAI_API_KEY to the canonical https://api.x.ai/v1 instead of the user's relay, unlike other API-key providers.

## #116879 [issue_not_planned] [Bug]: Corrupt session row crashes SessionEntry.from_dict — unguarded fromisoformat + direct key access
labels: ['type/bug', 'comp/gateway', 'P2', 'sweeper:risk-session-state']
- **deepseek-v4.1-flash** (None, None, None, conf None): SessionEntry.from_dict in gateway/session.py performs unguarded direct key access and datetime.fromisoformat calls, so a single corrupt or legacy session row raises an uncaught KeyError/ValueError and crashes session restore/list instead of quarantining the bad row.

## #116880 [issue_not_planned] [Bug]: Compression appends synthetic user snapshot with raw list.append, bypassing alternation guard
labels: ['type/bug', 'comp/agent', 'P2', 'sweeper:risk-session-state', 'area/compression']
- **deepseek-v4.1-flash** (None, None, None, conf None): In conversation compression, a synthetic todo-snapshot user message is appended with raw list.append instead of append_message, allowing adjacent user roles that break strict-alternation providers.

## #113039 [issue_not_planned] Always approval can serialize a routed profile from merged config
labels: ['type/bug', 'comp/cli', 'area/config', 'P2', 'sweeper:risk-compatibility', 'area/profiles']
- **deepseek-v4.1-flash** (None, None, None, conf None): save_permanent_allowlist reads load_config() then writes save_config(), so in a routed profile process the write may overwrite unrelated routed-profile keys because the read came from the launch profile's merged/default config, and it should instead use read_raw_config() as the write-back source and modify only command_allowlist while covering existing and missing routed profile config files.

## #120897 [issue_not_planned] [Bug]: Kaspersky false positive: desktop electron-main.mjs flagged as HEUR:Trojan-PSW.JS.Disco.gen (Windows, build-from-source)
labels: ['type/bug', 'P3', 'comp/desktop', 'platform/windows']
- **deepseek-v4.1-flash** (None, None, None, conf None): Kaspersky Internet Security reports a static file-heuristic false positive (HEUR:Trojan-PSW.JS.Disco.gen) on the desktop app's built Electron main-process bundle electron-main.mjs, both in dist and in the packaged app.asar.unpacked.

## #115185 [issue_not_planned] [Bug]: SenseNova custom provider: insufficient_quota treated as billing error instead of rate limit
labels: ['type/bug', 'comp/agent', 'P3', 'needs-repro', 'area/billing', 'bug']
- **deepseek-v4.1-flash** (None, None, None, conf None): The SenseNova custom provider misclassifies the `insufficient_quota` error as a billing error rather than a rate-limit error, causing incorrect error handling in the agent core.

## #116352 [issue_not_planned] [Bug]: https://support.nousresearch.com/diagnostics/0c51d585-4129-4fa1-8246-5a2a36fd02c0
labels: ['type/bug', 'comp/agent', 'P2', 'needs-repro', 'platform/windows', 'bug']
- **deepseek-v4.1-flash** (None, None, None, conf None): Hermes reports the API key as invalid and fails to start replies with an internal error, preventing tools from working on Windows 11.

## #123195 [issue_not_planned] Withdrawn — filed in error
labels: ['invalid', 'P3']
- **deepseek-v4.1-flash** (None, None, None, conf None): The issue was filed in error and has been withdrawn by the reporter.

## #114741 [issue_not_planned] [Bug]: Stale-stream watchdog ignored its 600s threshold and fired 23,261s (6.5 h) late — turn hung silently
labels: ['type/bug', 'comp/agent', 'provider/deepseek', 'P2', 'needs-repro', 'area/streaming']
- **deepseek-v4.1-flash** (None, None, None, conf None): The stale-stream watchdog failed to enforce its 600s threshold on a second stall in the same session, firing 23,261s (6.46h) late and leaving a turn hung silently, likely because the stall origin timestamp is not reset after the first stale_stream_kill.

## #120215 [issue_not_planned] Desktop: transcript-tail cache can freeze a session on stale content after websocket detach (survives restart)
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **deepseek-v4.1-flash** (None, None, None, conf None): The desktop app's transcript-tail cache can leave a session permanently frozen on stale transcript content (surviving restarts) because a detached websocket prevents the authoritative reconcile from overwriting the cached tail, and the cache entry is never invalidated.

## #123949 [pr_open] feat(kanban): add resumable release approval gate
labels: ['type/feature', 'comp/cli', 'comp/gateway', 'area/config', 'P3', 'needs-decision', 'sweeper:risk-compatibility']
- **deepseek-v4.1-flash** (None, None, None, conf None): Add a durable, replay-safe Kanban release approval gate that intercepts authenticated `freigegeben` replies and invokes a versioned adapter with lease-based resume and fail-closed behavior.

## #123950 [pr_open] fix(agent): shield the protect_first_n head from the Phase-1 tool-result prune (#123935)
labels: ['type/bug', 'comp/agent', 'P2', 'sweeper:risk-session-state', 'area/compression']
- **deepseek-v4.1-flash** (None, None, None, conf None): ContextCompressor._prune_old_tool_results() starts its demotion/truncation passes at index 0, so it prunes tool results inside the protect_first_n head that the summarization phase later protects (e.g. a kanban_show task card in the first turn gets stubbed on the first compression).

## #123872 [pr_open] fix(desktop): let progressing catalog downloads outlive the deadline
labels: ['type/bug', 'tool/skills', 'P2', 'comp/desktop']
- **deepseek-v4.1-flash** (None, None, None, conf None): Desktop Discover aborts a healthy but slow catalog download after a fixed 60-second total deadline, because fetchCatalog applies AbortSignal.timeout across the entire response including the large skills body.

## #124004 [pr_open] fix(kanban): route review handoffs to valid reviewers
labels: ['type/bug', 'comp/cli', 'comp/cron', 'area/config', 'P3', 'sweeper:risk-compatibility', 'sweeper:risk-automation']
- **deepseek-v4.1-flash** (None, None, None, conf None): Kanban review handoffs can be omitted or routed to stale reviewer names, so they need to be sent to a valid installed reviewer profile.

## #123905 [pr_open] fix(homeassistant): no-op state_changed events no longer consume the cooldown (salvage #12083)
labels: ['type/bug', 'comp/gateway', 'comp/plugins', 'P2', 'sweeper:risk-message-delivery']
- **deepseek-v4.1-flash** (None, None, None, conf None): The Home Assistant adapter stamps the per-entity cooldown before deciding whether to forward a state_changed event, so attribute-only or removal events that are dropped start the 30 s window and a real state change immediately after is silently dropped.

## #123932 [pr_open] fix(runtime): skip billing-benched Nous before configured fallback
labels: ['type/bug', 'comp/agent', 'comp/cli', 'provider/nous', 'P2', 'area/billing']
- **deepseek-v4.1-flash** (None, None, None, conf None): New sessions can resolve the singleton Nous JWT even when that credential is billing-benched in the pool, causing an avoidable failing inference request before the configured fallback is attempted.

## #122922 [pr_merged] fix(desktop): render reasoning effort as a badge chip, not part of the model name
labels: ['type/bug', 'P3', 'comp/desktop']
- **deepseek-v4.1-flash** (None, None, None, conf None): In the desktop model catalog menu, the reasoning-effort value is rendered as inline tertiary text appended to the model name (e.g. "Qwen3.7 Max High"), so users mistake it for part of the model's name instead of a setting of the same model.

## #122923 [pr_merged] fix(desktop): track one unscoped stream pin per session
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop']
- **deepseek-v4.1-flash** (None, None, None, conf None): Concurrent desktop chat streams share a single unscoped stream session pin, so a second chat's message.start overwrites the first's pin and misattributes the first stream's unscoped gateway events to the second chat's transcript.

## #122295 [pr_merged] fix(desktop): log what ssh did when an SSH connect fails
labels: ['type/bug', 'backend/ssh', 'P3', 'comp/desktop']
- **deepseek-v4.1-flash** (None, None, None, conf None): Desktop SSH connection failures return an error without logging the ssh exit code, signal, or stderr, leaving no diagnostics to explain why the ssh child exits.

## #123220 [pr_merged] test: make the home-IO guard cheap enough for the cron soak to finish
labels: ['type/test', 'comp/cron', 'P2']
- **deepseek-v4.1-flash** (None, None, None, conf None): The e2e cron soak test is SIGKILLed at the 900s per-file cap because the autouse HomeIOGuard's per-syscall path checks are too slow, so the guard needs to be made cheap enough for the soak to finish.

## #122841 [pr_merged] fix(processes): persist_on_release keeps background jobs alive across lifecycle kill sweeps
labels: ['type/bug', 'comp/agent', 'comp/cli', 'comp/gateway', 'comp/tools', 'comp/tui', 'tool/terminal', 'P2', 'sweeper:risk-session-state', 'area/sessions']
- **deepseek-v4.1-flash** (None, None, None, conf None): Background terminal processes spawned with background=true are unconditionally killed by agent lifecycle sweeps (agent release, gateway turn timeout, agent close) with no way for a job to opt out and survive the conversation.

## #122900 [pr_merged] fix(desktop): stop home-directory repo scans when no roots are configured
labels: ['type/bug', 'comp/cli', 'area/config', 'P2', 'sweeper:risk-compatibility', 'comp/desktop']
- **deepseek-v4.1-flash** (None, None, None, conf None): An empty desktop.repo_scan_roots configuration caused Desktop to scan the user's entire home directory on every launch, so the fix makes empty roots a safe no-op that requires explicit opt-in for filesystem scanning.

## #124001 [pr_merged] Plugin catalog is readable in light mode (salvage #123809)
labels: ['type/bug', 'P3', 'Plugin Catalog']
- **deepseek-v4.1-flash** (None, None, None, conf None): The plugin catalog, plugin pages, and author pages are not readable in light mode due to insufficient color contrast, while dark mode should remain unchanged.

## #122894 [pr_closed_unmerged] feat(memory): expose raw transcript to opt-in checkpoints
labels: ['type/feature', 'comp/agent', 'comp/plugins', 'P3', 'sweeper:risk-session-state', 'area/memory', 'area/compression']
- **deepseek-v4.1-flash** (None, None, None, conf None): Opt-in v2 checkpoint providers cannot access the complete pre-compression transcript because the evidence list normalizes messages and omits tool output, so an external archival provider needs the raw messages passed through the checkpoint hook.

## #122904 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: ['type/refactor', 'comp/tui', 'P3', 'comp/desktop']
- **deepseek-v4.1-flash** (None, None, None, conf None): JavaScript formatting and lint issues need to be automatically fixed by running `npm run fix`.

## #121799 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: []
- **deepseek-v4.1-flash** (None, None, None, conf None): The JavaScript codebase has lint and formatting issues that need to be automatically fixed via `npm run fix`.

## #123668 [pr_closed_unmerged] fix(cron): read the committed generation for Windows cron scripts
labels: ['type/bug', 'comp/cron', 'P1', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'platform/windows', 'area/install-update']
- **deepseek-v4.1-flash** (None, None, None, conf None): Windows cron scripts resolve their child interpreter's dependency tree via pm.environments.selected_venv, which falls back to the leftover in-tree venv built for a different CPython interpreter, causing every script to die with ModuleNotFoundError: No module named 'pydantic_core._pydantic_core'.

## #122315 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: ['type/refactor', 'comp/tui', 'comp/plugins', 'P3', 'sweeper:risk-automation', 'comp/desktop']
- **deepseek-v4.1-flash** (None, None, None, conf None): JavaScript formatting and lint issues need to be auto-fixed via `npm run fix`.

