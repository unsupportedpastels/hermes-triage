## #123888 [issue_open] Desktop shows the first-run setup chooser on every start while the local install is healthy (Windows, PM install)
labels: ['type/bug', 'P2', 'needs-repro', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.99): Hermes Desktop repeatedly shows the first-run setup chooser on Windows despite a healthy local runtime, because launcher and version-probe resolution failures are silently treated as missing installations.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.88): Hermes Desktop incorrectly shows the first-run setup chooser on every launch despite a healthy local runtime, because the launcher resolution path fails silently and falls through to bootstrap without logging the cause.

## #123898 [issue_open] Telegram: responses rejected with send_path_degraded are never redelivered until restart (runtime sweep only wired to adapter reconnect)
labels: ['type/bug', 'comp/gateway', 'platform/telegram', 'P2', 'sweeper:risk-message-delivery']
- **space-bunny-alpha** (bug, comp/gateway, P2, conf 0.99): Telegram responses rejected with send_path_degraded are left failed in the delivery ledger because runtime redelivery is only triggered by a full adapter reconnect, so replies remain undelivered until gateway restart.
- **longcat-2.0** (bug, comp/gateway, P2, conf 0.85): Telegram responses rejected with send_path_degraded are recorded as failed in the delivery ledger but never redelivered until gateway restart, because the runtime redelivery sweep is only triggered by full adapter reconnects and not by Telegram's polling-generation degradation/recovery path.

## #123685 [issue_open] Desktop: archiving a session resurrects it in the sidebar seconds later; clicking the ghost row fails with "Session owner could not be resolved"
labels: ['type/bug', 'duplicate', 'P3', 'sweeper:risk-session-state', 'comp/desktop', 'platform/windows', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): Archiving a desktop session can cause a stale sidebar row to reappear with missing owner metadata, making the ghost session unopenable until the app reloads.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): Archiving a session in the desktop app causes it to briefly disappear then reappear as a stale ghost row in the sidebar, which fails with 'Session owner could not be resolved' when clicked.

## #123989 [issue_open] [Bug]: Multiplex: API-server turns for different profiles share one Docker sandbox when their opening messages match
labels: ['type/bug', 'comp/gateway', 'tool/terminal', 'backend/docker', 'area/config', 'P2', 'sweeper:risk-session-state', 'sweeper:risk-message-delivery', 'sweeper:risk-security-boundary', 'bug', 'area/profiles']
- **space-bunny-alpha** (bug, comp/gateway, P1, conf 0.99): API-server requests from different profiles can collide on the same derived session ID and reuse each other’s persistent Docker sandbox, violating profile isolation and applying the wrong image, mounts, and policy.
- **longcat-2.0** (bug, comp/gateway, P1, conf 0.95): On a multiplexed gateway, API-server turns for different profiles derive the same session id when their opening messages match, causing both profiles' turns to attach to a single shared Docker container and breaking per-profile sandbox isolation.

## #123801 [issue_open] [Bug]: macOS Desktop renders duplicate assistant reply on d0288be5 despite one stored row and one completion
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.98): macOS Desktop intermittently renders a single completed assistant response twice by combining history and live-stream message roots.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.9): Hermes Desktop on macOS intermittently renders the same assistant reply twice despite a single stored message row and one completion event.

## #123856 [issue_open] Desktop: stale-transcript guard never converges — repeated 'conversation is stale' refusals lock the user out of a long session
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): The desktop stale-transcript guard can repeatedly refuse prompts in a long session after a gateway reconnect, permanently locking the user out despite the transcript being static and healthy.
- **longcat-2.0** (bug, comp/desktop, P1, conf 0.95): The stale-transcript guard in the desktop app enters an infinite refusal loop for long sessions, permanently locking users out of conversations without a way to recover.

## #124006 [issue_open] [Bug]: `ultra` reasoning effort is sent unclamped on gpt-6 models, silencing the gateway with a non-retryable 400 (clamp gated on literal "gpt-5.6")
labels: ['type/bug', 'comp/agent', 'provider/openai', 'P2', 'sweeper:risk-compatibility']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.99): The `ultra` reasoning effort is sent unchanged to gpt-6 Codex Responses models because clamping is limited to the literal gpt-5.6 model name, causing every gateway call to fail with a non-retryable 400.
- **longcat-2.0** (bug, comp/agent, P1, conf 0.95): The `ultra` reasoning effort is sent unclamped to the Codex Responses endpoint for `gpt-6` models because the clamp is gated on a literal `gpt-5.6` string check, causing every model call to fail with a non-retryable HTTP 400 and silencing the agent.

## #123787 [issue_open] [Bug]: Email attachments lose their filename when it has a space, ';' or non-ASCII characters
labels: ['type/bug', 'comp/plugins', 'platform/email', 'P3', 'sweeper:risk-message-delivery']
- **space-bunny-alpha** (bug, comp/plugins, P2, conf 0.99): Outgoing email attachment filenames are truncated or make attachments unrecognized when they contain spaces, semicolons, or non-ASCII characters because Content-Disposition parameters are interpolated without proper quoting and encoding.
- **longcat-2.0** (bug, comp/plugins, P2, conf 0.85): The email adapter's _attach_file interpolates the filename directly into the Content-Disposition header string, so attachment names containing spaces, semicolons, or non-ASCII characters are truncated by mail clients or break the attachment header entirely.

## #123971 [issue_open] Windows: hermes update always fails its post-relaunch gateway check (exit 1) when the Desktop started the gateway
labels: ['type/bug', 'comp/cli', 'comp/gateway', 'P2', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/gateway, P1, conf 0.99): On Windows, the Desktop-started gateway is incorrectly rejected by post-update process verification because its inline Hermes launcher source is not recognized, causing successful updates to return exit 1 and repeatedly restart the gateway.
- **longcat-2.0** (bug, comp/gateway, P1, conf 0.8): On Windows, hermes update always fails its post-relaunch gateway verification (exit 1) when the Desktop started the gateway, because the gateway PID identity probes reject the inline-source command line of Hermes' own launcher, and the failed verification then deletes the live gateway's pid file and re-spawns (killing) the gateway on resume retries.

## #123768 [issue_open] Live compression config silently aborts on non-ContextCompressor context engines (`_coerce_threshold_tokens_cap`)
labels: ['type/bug', 'duplicate', 'comp/tui', 'comp/plugins', 'P3', 'sweeper:risk-session-state', 'area/compression']
- **space-bunny-alpha** (bug, comp/gateway, P2, conf 0.99): Live compression configuration updates fail for non-ContextCompressor context engines because the gateway calls a compressor-specific static method on the active engine, causing partial updates and stale cached token budgets.
- **longcat-2.0** (bug, comp/tui, P2, conf 0.95): Live compression config edits silently abort on non-ContextCompressor context engines because `_coerce_threshold_tokens_cap` is called as a bound method on the engine object, which lacks this attribute.

## #123781 [issue_open] [Bug]: `/skin MyTheme` answers "Unknown skin: mytheme" for a user skin with capitals in its name
labels: ['type/bug', 'comp/cli', 'P3']
- **space-bunny-alpha** (bug, comp/cli, P2, conf 0.99): The CLI lowercases `/skin` arguments before matching available skins, preventing user-defined skins with capital letters from being selected.
- **longcat-2.0** (bug, comp/cli, P2, conf 0.95): The CLI's /skin command lowercases the skin name argument, preventing the selection of user skins that have capitalized names.

## #123988 [issue_open] fix(tui_gateway): allocate file.attach uploads atomically
labels: ['type/bug', 'comp/tui', 'tool/file', 'P2', 'area/profiles']
- **space-bunny-alpha** (bug, comp/gateway, P1, conf 0.99): Concurrent file.attach uploads with the same sanitized filename can overwrite each other or leave partial files after write failures.
- **longcat-2.0** (bug, comp/tui, P2, conf 0.9): The TUI gateway's file.attach upload path allocates destination files non-atomically, so concurrent same-name uploads in one profile can silently overwrite each other and failed writes leave partial files behind.

## #123832 [issue_open] [Bug]: a tool call whose stream drops with no finish_reason runs on a repaired prefix (`timeout: 600` → `6`, a todo list cut short)
labels: ['type/bug', 'comp/agent', 'P1', 'area/streaming']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.99): When a chat-completions stream drops without a finish_reason, the agent repairs and executes truncated tool-call arguments, causing unintended values such as an incomplete timeout or todo list to be used.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.95): A tool call whose stream drops with no finish_reason gets its arguments repaired and executed instead of triggering a partial-stream retry.

## #123828 [issue_open] [Feature]: Component-scoped updates — let Desktop-only users skip the ui-tui and web build in `hermes update`
labels: ['type/feature', 'comp/cli', 'P3', 'sweeper:risk-compatibility', 'area/install-update']
- **space-bunny-alpha** (feature, comp/cli, P2, conf 0.99): `hermes update` always installs and builds the TUI and web workspaces, wasting substantial time for Desktop-only and other split-host users.
- **longcat-2.0** (feature, comp/cli, P2, conf 0.92): hermes update unconditionally rebuilds the TUI and web workspaces on every run, with no way for Desktop-only users to opt out, causing unnecessary build time and potential update failures.

## #120575 [issue_completed] [Feature]: One switch for binary settings — desktop configuration views mix Switch and SegmentedControl
labels: ['type/feature', 'P3', 'comp/desktop', 'comp/dashboard']
- **space-bunny-alpha** (feature, comp/desktop, P2, conf 0.99): Desktop configuration views use inconsistent controls for binary on/off settings instead of the canonical Switch, while multi-option settings must remain segmented controls.
- **longcat-2.0** (feature, comp/desktop, P3, conf 0.9): The desktop app's configuration surfaces inconsistently render binary on/off settings using both Switch and SegmentedControl instead of a single unified affordance.

## #120580 [issue_completed] [Bug]: Desktop re-renders the previous turn's tools and final answer after a new reply when background review is superseded
labels: ['type/bug', 'P2', 'needs-repro', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.98): The desktop renderer re-appends the previous turn's tool activity and final answer after a new reply when a background review is superseded.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.92): When a new prompt hard-interrupts a still-running background review thread, the desktop renderer appends the previous turn's tool activity and final answer below the new reply, duplicating content that exists only once in the store.

## #119809 [issue_completed] Windows: Desktop stops every profile's messaging gateway before an update but never restarts it on the success path
labels: ['type/bug', 'comp/gateway', 'P1', 'sweeper:risk-message-delivery', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.99): After a successful Windows desktop update, the app stops all profile messaging gateways but never restarts them, leaving messaging services offline until manually started.
- **longcat-2.0** (bug, comp/desktop, P1, conf 0.9): On Windows, the desktop app stops every profile's messaging gateway before applying an update but never restarts them on the successful update path (while also suppressing the CLI updater's cold-start fallback), leaving all gateways down indefinitely.

## #121984 [issue_completed] [Bug]: a Desktop SSH backend (serve --isolated) is adopted by the host's own Desktop, misclassified by hermes update, and runs stale code after updates
labels: ['type/bug', 'backend/ssh', 'comp/cli', 'P2', 'sweeper:risk-compatibility', 'comp/desktop', 'area/install-update']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.96): Remote Desktop SSH backends are misidentified as host-local serve processes, allowing local Desktop discovery and update recovery to adopt, misclassify, and leave them running stale code.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): A remote Desktop's SSH-isolated serve backend is misclassified by the host's own Desktop and updater, causing it to run stale code after updates and potentially dropping chats.

## #119991 [issue_completed] [Bug]: Dashboard shows "not ready yet, try again" for a corrupt state.db and drops the server's `hermes doctor` instruction
labels: ['type/bug', 'P3', 'comp/dashboard']
- **space-bunny-alpha** (bug, comp/dashboard, P2, conf 0.99): The dashboard discards actionable messages from object-shaped API error details, showing a generic retry prompt instead of the server's instructions for repairing a corrupt state.db.
- **longcat-2.0** (bug, comp/dashboard, P2, conf 0.95): The web dashboard's extractDetail in web/src/lib/api-error.ts cannot parse object-shaped 503 error details, so a corrupt state.db shows the generic 'not ready yet, try again' message instead of the server's actionable 'run hermes doctor' instruction.

## #120205 [issue_completed] Windows: foreign_state_db_holders() returns [] so the state.db write-guard / optimize-storage preflight is a silent no-op
labels: ['type/bug', 'comp/agent', 'comp/cli', 'P1', 'sweeper:risk-session-state', 'sweeper:risk-platform-windows', 'platform/windows', 'area/sessions']
- **space-bunny-alpha** (bug, comp/cli, P1, conf 0.98): On Windows, foreign_state_db_holders() always returns an empty list, allowing database maintenance to run while other processes are using state.db instead of refusing the operation.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.95): On Windows, foreign_state_db_holders() unconditionally returns an empty list, silently bypassing the write-guard that should prevent state.db maintenance while other processes hold the store.

## #122845 [issue_completed] __Hobson_permission_probe__
labels: ['invalid', 'comp/cli', 'P4']
- **space-bunny-alpha** (other, comp/agent, P3, conf 0.35): A temporary permission probe related to __Hobson_permission_probe__ is being tracked as an issue.
- **longcat-2.0** (other, comp/gateway, P3, conf 0.3): This is a temporary permission probe/test issue with no actual bug report or feature request content.

## #119961 [issue_completed] [Bug]: /compress here N in the default in-place mode drops the kept exchanges from state.db
labels: ['type/bug', 'comp/agent', 'P0', 'sweeper:risk-session-state', 'area/sessions', 'area/compression']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.99): In-place manual conversation compression removes the exchanges the user explicitly asked to keep from state.db, causing them to disappear from resumed model and display histories across all affected surfaces.
- **longcat-2.0** (bug, comp/agent, P1, conf 0.95): /compress here N with the default in-place compression mode fails to persist the kept tail exchanges to state.db, so those exchanges are silently lost from both model and display history on resume or agent rebuild across CLI, TUI/Desktop, and gateway surfaces.

## #121347 [issue_completed] [Bug]: xai ignores model.base_url — request and XAI_API_KEY go to api.x.ai instead of the configured relay
labels: ['type/bug', 'comp/cli', 'provider/xai', 'area/config', 'P2']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.98): The xai provider ignores the configured model.base_url and sends requests and XAI_API_KEY to the canonical api.x.ai endpoint instead of the designated relay.
- **longcat-2.0** (bug, comp/cli, P2, conf 0.95): The xai provider ignores the configured model.base_url and sends requests and the XAI_API_KEY to the default https://api.x.ai/v1 instead of the specified relay URL.

## #116879 [issue_not_planned] [Bug]: Corrupt session row crashes SessionEntry.from_dict — unguarded fromisoformat + direct key access
labels: ['type/bug', 'comp/gateway', 'P2', 'sweeper:risk-session-state']
- **space-bunny-alpha** (bug, comp/gateway, P1, conf 0.99): A corrupt or legacy session record with missing fields or invalid ISO timestamps crashes session listing or restoration instead of being quarantined.
- **longcat-2.0** (bug, comp/gateway, P2, conf 0.9): SessionEntry.from_dict crashes on corrupt session rows due to unguarded datetime.fromisoformat calls and direct dictionary key access instead of quarantining the bad record.

## #116880 [issue_not_planned] [Bug]: Compression appends synthetic user snapshot with raw list.append, bypassing alternation guard
labels: ['type/bug', 'comp/agent', 'P2', 'sweeper:risk-session-state', 'area/compression']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.99): Conversation compression appends a synthetic user snapshot with raw list.append, creating adjacent user messages that strict role-alternation providers reject with HTTP 400 errors.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.9): Raw list.append in conversation compression bypasses the role alternation guard, allowing adjacent user roles that cause strict-alternation providers (Anthropic/Bedrock) to return 400 errors and kill the turn mid-compression.

## #113039 [issue_not_planned] Always approval can serialize a routed profile from merged config
labels: ['type/bug', 'comp/cli', 'area/config', 'P2', 'sweeper:risk-compatibility', 'area/profiles']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.96): Saving a permanent command allowlist can overwrite unrelated routed-profile settings because it writes back merged launch configuration instead of the routed profile's raw configuration.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.85): In a routed profile process, save_permanent_allowlist reads the merged launch config but writes to the routed profile config path, potentially overwriting unrelated routed-profile config keys.

## #120897 [issue_not_planned] [Bug]: Kaspersky false positive: desktop electron-main.mjs flagged as HEUR:Trojan-PSW.JS.Disco.gen (Windows, build-from-source)
labels: ['type/bug', 'P3', 'comp/desktop', 'platform/windows']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): Kaspersky's generic password-stealer heuristic falsely flags the unsigned Windows Electron main-process bundle in desktop builds, requiring user exclusions or vendor false-positive submission.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): Kaspersky Internet Security flags the desktop app's Electron main-process bundle (electron-main.mjs) as a false positive HEUR:Trojan-PSW.JS.Disco.gen.

## #115185 [issue_not_planned] [Bug]: SenseNova custom provider: insufficient_quota treated as billing error instead of rate limit
labels: ['type/bug', 'comp/agent', 'P3', 'needs-repro', 'area/billing', 'bug']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.99): SenseNova custom-provider responses with insufficient_quota are misclassified as billing errors rather than rate-limit errors.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.7): The SenseNova custom provider misclassifies insufficient_quota errors as fatal billing errors instead of rate limit errors, preventing the agent from retrying appropriately.

## #116352 [issue_not_planned] [Bug]: https://support.nousresearch.com/diagnostics/0c51d585-4129-4fa1-8246-5a2a36fd02c0
labels: ['type/bug', 'comp/agent', 'P2', 'needs-repro', 'platform/windows', 'bug']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.83): Hermes repeatedly rejects the user's API key and fails all program requests with an internal problem instead of allowing authenticated use.
- **longcat-2.0** (bug, comp/tools, P2, conf 0.6): Hermes agent reports an internal problem when starting replies and fails to execute tools, with API key errors preventing program execution.

## #123195 [issue_not_planned] Withdrawn — filed in error
labels: ['invalid', 'P3']
- **space-bunny-alpha** (other, comp/agent, P3, conf 0.99): This issue was withdrawn because it was filed in error and contains no actionable problem.
- **longcat-2.0** (other, comp/agent, P3, conf 0.1): The issue was filed in error and withdrawn by the reporter, with all content removed, so it contains no actionable report.

## #114741 [issue_not_planned] [Bug]: Stale-stream watchdog ignored its 600s threshold and fired 23,261s (6.5 h) late — turn hung silently
labels: ['type/bug', 'comp/agent', 'provider/deepseek', 'P2', 'needs-repro', 'area/streaming']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.97): The agent's stale-stream watchdog can fail to enforce its 600-second timeout, leaving a streaming turn hung for hours without a user-visible failure.
- **longcat-2.0** (bug, comp/agent, P1, conf 0.95): The stale-stream watchdog fired 38× later than its 600s threshold (23,261s late), causing a turn to hang silently for 6.46 hours with no user-visible signal.

## #120215 [issue_not_planned] Desktop: transcript-tail cache can freeze a session on stale content after websocket detach (survives restart)
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.99): The desktop transcript-tail cache can permanently display stale session content after a websocket detaches because cached data is never invalidated when authoritative reconciliation fails or does not occur.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): The desktop app's transcript-tail cache can permanently freeze a session's view on stale content after a websocket detach, and this stale state survives app restarts because the cache is never invalidated when the authoritative reconcile fails to land.

## #123949 [pr_open] feat(kanban): add resumable release approval gate
labels: ['type/feature', 'comp/cli', 'comp/gateway', 'area/config', 'P3', 'needs-decision', 'sweeper:risk-compatibility']
- **space-bunny-alpha** (feature, comp/agent, P2, conf 0.98): Adds a durable, replay-safe release approval gate that requires explicit authenticated approval and validates environment-specific release results before promotion.
- **longcat-2.0** (feature, comp/cli, P3, conf 0.88): Add a durable, replay-safe release approval gate to kanban workflows that intercepts authenticated release approvals in gateway paths with lease-based resume and receipt validation.

## #123950 [pr_open] fix(agent): shield the protect_first_n head from the Phase-1 tool-result prune (#123935)
labels: ['type/bug', 'comp/agent', 'P2', 'sweeper:risk-session-state', 'area/compression']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.99): Context compression prunes protected early tool results, destroying task-card facts before later summarization can preserve them.
- **longcat-2.0** (bug, comp/agent, P1, conf 0.98): ContextCompressor's Phase-1 tool-result prune demotes tool results inside the protect_first_n head before the summarization phase can protect them, causing data loss in early turns.

## #123872 [pr_open] fix(desktop): let progressing catalog downloads outlive the deadline
labels: ['type/bug', 'tool/skills', 'P2', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): Desktop Discover aborts healthy but slow catalog downloads after 60 seconds because a fixed total timeout does not reset when response bytes continue progressing.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): Desktop Discover aborts healthy slow catalog transfers after 60 seconds because the total deadline does not renew with continued byte progress.

## #124004 [pr_open] fix(kanban): route review handoffs to valid reviewers
labels: ['type/bug', 'comp/cli', 'comp/cron', 'area/config', 'P3', 'sweeper:risk-compatibility', 'sweeper:risk-automation']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.9): Kanban review handoffs can be omitted or target stale reviewer names instead of routing them to a valid installed reviewer profile.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.7): Kanban review handoffs were silently omitted when the assigned reviewer name was stale or invalid, so reviews never reached a valid reviewer; the PR adds an optional kanban.default_reviewer fallback to a deterministic installed profile while preserving dispatcher admission, caps, and guards.

## #123905 [pr_open] fix(homeassistant): no-op state_changed events no longer consume the cooldown (salvage #12083)
labels: ['type/bug', 'comp/gateway', 'comp/plugins', 'P2', 'sweeper:risk-message-delivery']
- **space-bunny-alpha** (bug, comp/gateway, P2, conf 0.99): Home Assistant attribute-only and removal events incorrectly start the per-entity cooldown, causing subsequent genuine state changes to be silently dropped.
- **longcat-2.0** (bug, comp/plugins, P2, conf 0.85): The Home Assistant adapter stamped the per-entity event cooldown before deciding whether to forward a state_changed event, so attribute-only no-op events consumed the 30s cooldown and real state changes immediately after were silently dropped.

## #123932 [pr_open] fix(runtime): skip billing-benched Nous before configured fallback
labels: ['type/bug', 'comp/agent', 'comp/cli', 'provider/nous', 'P2', 'area/billing']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.98): New sessions bypass an all-billing-benched Nous credential pool entry and attempt the benched singleton before using the configured fallback, causing an avoidable failed inference request.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.92): New sessions resolve the singleton Nous JWT even when the credential is billing-benched, causing an avoidable failing inference request before the configured fallback is attempted.

## #122922 [pr_merged] fix(desktop): render reasoning effort as a badge chip, not part of the model name
labels: ['type/bug', 'P3', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): The desktop model catalog rendered reasoning effort as plain text appended to the model name, making settings such as “High” appear to be part of the model identifier instead of a distinct option.
- **longcat-2.0** (bug, comp/desktop, P3, conf 0.95): In the desktop model catalog menu, the reasoning effort setting was rendered as plain tertiary text appended to the model name (e.g. 'Qwen3.7 Max High'), causing users to misread it as part of the model's name rather than a separate setting.

## #122923 [pr_merged] fix(desktop): track one unscoped stream pin per session
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.99): Concurrent desktop chat streams can overwrite a shared unscoped gateway session pin, causing one chat's deltas, tool events, and reasoning to be merged into another chat's transcript.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): Concurrently streaming desktop chats can steal each other's unscoped gateway stream events because the gateway-event router used a single shared slot for the unscoped stream session ID, causing one conversation's deltas, tool events, and reasoning to be grafted onto another's transcript.

## #122295 [pr_merged] fix(desktop): log what ssh did when an SSH connect fails
labels: ['type/bug', 'backend/ssh', 'P3', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): Desktop SSH mode does not log exit status, signals, or stderr when a connection attempt fails, leaving the underlying cause invisible for diagnosis.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.9): Desktop SSH connection failures are invisible to users and developers because SshConnection.open() returns the classified error without logging the exit code, signal, or stderr, so the cause of ssh child processes dying after connect cannot be diagnosed.

## #123220 [pr_merged] test: make the home-IO guard cheap enough for the cron soak to finish
labels: ['type/test', 'comp/cron', 'P2']
- **space-bunny-alpha** (bug, comp/cron, P2, conf 0.99): The HomeIOGuard made the cron e2e soak exceed its 900-second timeout due to excessive per-syscall path-checking overhead.
- **longcat-2.0** (bug, comp/cron, P2, conf 0.95): The e2e cron soak test was being SIGKILLed at the 900s CI cap because the HomeIOGuard's check() method cost ~611μs per guarded syscall, accumulating ~1400s of CPU time across 2.3M calls.

## #122841 [pr_merged] fix(processes): persist_on_release keeps background jobs alive across lifecycle kill sweeps
labels: ['type/bug', 'comp/agent', 'comp/cli', 'comp/gateway', 'comp/tools', 'comp/tui', 'tool/terminal', 'P2', 'sweeper:risk-session-state', 'area/sessions']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.99): Background terminal jobs are terminated by agent-lifecycle cleanup paths despite users explicitly requesting that they persist across session transitions, and the fix must preserve explicit stops and gateway shutdown cleanup.
- **longcat-2.0** (feature, comp/agent, P2, conf 0.95): Background processes are unconditionally killed by agent-lifecycle sweeps such as session end, turn timeout, and agent close, preventing users from keeping long-running jobs alive across conversations.

## #122900 [pr_merged] fix(desktop): stop home-directory repo scans when no roots are configured
labels: ['type/bug', 'comp/cli', 'area/config', 'P2', 'sweeper:risk-compatibility', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.99): Desktop repository discovery scans the entire home directory when no scan roots are configured, causing unintended filesystem traversal and potentially accessing protected locations on macOS.
- **longcat-2.0** (bug, comp/desktop, P1, conf 0.95): An empty desktop.repo_scan_roots configuration silently expands to a bounded scan of the user's entire home directory on every Desktop launch.

## #124001 [pr_merged] Plugin catalog is readable in light mode (salvage #123809)
labels: ['type/bug', 'P3', 'Plugin Catalog']
- **space-bunny-alpha** (bug, comp/plugins, P2, conf 0.98): The plugin catalog, plugin pages, and author pages have insufficient text and UI contrast in light mode, making their content difficult to read.
- **longcat-2.0** (bug, comp/plugins, P2, conf 0.95): The plugin catalog, plugin pages, and author pages are unreadable in light mode due to insufficient color contrast.

## #122894 [pr_closed_unmerged] feat(memory): expose raw transcript to opt-in checkpoints
labels: ['type/feature', 'comp/agent', 'comp/plugins', 'P3', 'sweeper:risk-session-state', 'area/memory', 'area/compression']
- **space-bunny-alpha** (feature, comp/agent, P2, conf 0.99): Adds an opt-in handoff of the original pre-compression transcript to v2 checkpoint providers while preserving existing v1 and v2 message contracts and fail-closed behavior.
- **longcat-2.0** (feature, comp/agent, P3, conf 0.9): The v2 checkpoint evidence list normalizes messages and omits tool output, preventing external archival providers from accessing the complete original transcript before lossy compaction.

## #122904 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: ['type/refactor', 'comp/tui', 'P3', 'comp/desktop']
- **space-bunny-alpha** (other, comp/cli, P3, conf 0.98): The repository needs automated lint and formatting corrections applied to the JavaScript code.
- **longcat-2.0** (other, comp/tools, P3, conf 0.7): JavaScript code contains lint and formatting issues that require auto-fixing.

## #121799 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: []
- **space-bunny-alpha** (other, comp/tools, P3, conf 0.62): Automatically apply JavaScript lint fixes and formatting changes once CI passes.
- **longcat-2.0** (other, comp/dashboard, P3, conf 0.55): An automated workflow run applies `npm run fix` lint and formatting corrections to the repository's JavaScript code.

## #123668 [pr_closed_unmerged] fix(cron): read the committed generation for Windows cron scripts
labels: ['type/bug', 'comp/cron', 'P1', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/cron, P1, conf 0.99): Windows cron scripts could use site-packages from a virtual environment created by a different Python interpreter, causing compiled dependencies such as pydantic_core to fail to import.
- **longcat-2.0** (bug, comp/cron, P2, conf 0.95): Windows cron scripts fail with ModuleNotFoundError for compiled extensions because the scheduler resolves the wrong interpreter's site-packages when no generation is committed.

## #122315 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: ['type/refactor', 'comp/tui', 'comp/plugins', 'P3', 'sweeper:risk-automation', 'comp/desktop']
- **space-bunny-alpha** (other, comp/cli, P3, conf 0.97): Adds an automated `npm run fix` workflow to auto-fix lint issues and formatting changes.
- **longcat-2.0** (other, comp/cli, P3, conf 0.9): JavaScript code has lint issues and formatting inconsistencies that need to be auto-fixed.

