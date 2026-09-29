## #123888 [issue_open] Desktop shows the first-run setup chooser on every start while the local install is healthy (Windows, PM install)
labels: ['type/bug', 'P2', 'needs-repro', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.98): Hermes Desktop repeatedly opens the first-run setup chooser on Windows despite a healthy local runtime, because backend and launcher resolution failures are silent and fall through to bootstrap-needed.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.9): Hermes Desktop repeatedly shows the first-run setup chooser on every launch despite a healthy local runtime, because the backend resolution path fails silently—returning null without logging the probe's exit code, signal, or timeout—causing the app to fall through to bootstrap.
- **deepseek-v4.1-flash** (bug, comp/desktop, P1, conf 0.72): Hermes Desktop on Windows shows the first-run setup chooser on every launch even though the local runtime is healthy, because the launcher/`--version` resolution path fails silently and falls through to bootstrap-needed.

## #123898 [issue_open] Telegram: responses rejected with send_path_degraded are never redelivered until restart (runtime sweep only wired to adapter reconnect)
labels: ['type/bug', 'comp/gateway', 'platform/telegram', 'P2', 'sweeper:risk-message-delivery']
- **space-bunny-alpha** (bug, comp/gateway, P2, conf 0.96): Telegram responses rejected with send_path_degraded remain failed and are not redelivered after the send path recovers, so replies can be dropped until the gateway restarts.
- **longcat-2.0** (bug, comp/gateway, P1, conf 0.7): Responses rejected with send_path_degraded are recorded as failed in the delivery ledger but never redelivered until gateway restart, because the runtime redelivery sweep is only triggered by full adapter reconnects and never by the Telegram polling-degradation recovery path.
- **deepseek-v4.1-flash** (bug, comp/gateway, P2, conf 0.85): Telegram replies rejected with send_path_degraded are recorded as failed in the delivery ledger but never redelivered until a gateway restart, because the runtime redelivery sweep is only triggered by full adapter reconnects and not by the Telegram polling-generation degradation/recovery path.

## #123685 [issue_open] Desktop: archiving a session resurrects it in the sidebar seconds later; clicking the ghost row fails with "Session owner could not be resolved"
labels: ['type/bug', 'duplicate', 'P3', 'sweeper:risk-session-state', 'comp/desktop', 'platform/windows', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): Archiving a session in the Windows desktop app can let an in-flight stale sidebar refresh merge the archived session back as an unusable ghost row, while the backend remains correctly archived.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): Archiving a session in the desktop app causes it to reappear as a ghost row in the sidebar due to a race condition, and clicking the ghost row fails with a 'Session owner could not be resolved' error.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.9): In the desktop app, archiving a session optimistically removes it from the sidebar but an in-flight list refresh merges the stale pre-archive row back as a ghost row lacking owner metadata, so clicking it fails with a fail-closed "Session owner could not be resolved" error until the window is reloaded.

## #123989 [issue_open] [Bug]: Multiplex: API-server turns for different profiles share one Docker sandbox when their opening messages match
labels: ['type/bug', 'comp/gateway', 'tool/terminal', 'backend/docker', 'area/config', 'P2', 'sweeper:risk-session-state', 'sweeper:risk-message-delivery', 'sweeper:risk-security-boundary', 'bug', 'area/profiles']
- **space-bunny-alpha** (bug, comp/gateway, P0, conf 0.99): API requests with identical opening messages can derive the same session ID across profiles in a multiplexed gateway, causing one profile's turns to reuse another profile's Docker sandbox and configuration.
- **longcat-2.0** (bug, comp/gateway, P1, conf 0.85): In a multiplexed host gateway, API-server turns for different profiles share the same Docker sandbox when their opening messages match, because the derived API session ID does not include the serving profile.
- **deepseek-v4.1-flash** (bug, comp/gateway, P1, conf 0.82): On a multiplexed host gateway, API-server turns for different profiles can share one persistent Docker container because the derived API session id (and the environment cache lookup) does not include the serving profile, breaking documented per-profile sandbox isolation.

## #123801 [issue_open] [Bug]: macOS Desktop renders duplicate assistant reply on d0288be5 despite one stored row and one completion
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): The macOS Electron desktop client intermittently reconciles a single completed assistant response as both a persisted history message and a live-streamed message, rendering the reply twice.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.8): Hermes Desktop on macOS intermittently renders the same assistant reply twice due to a history/live reconciliation issue.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.72): Hermes Desktop on macOS intermittently renders the same assistant reply twice (two separate assistant message roots) even though the gateway stored only one message row and emitted a single completion.

## #123856 [issue_open] Desktop: stale-transcript guard never converges — repeated 'conversation is stale' refusals lock the user out of a long session
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.97): The desktop stale-transcript guard repeatedly refuses prompts after a gateway reconnect for a long session, preventing the next send from ever passing and effectively locking the user out of the conversation.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.9): The stale-transcript guard in the desktop app repeatedly refuses sends for long sessions without converging, permanently locking the user out of the conversation.
- **deepseek-v4.1-flash** (bug, comp/desktop, P1, conf 0.82): In the Electron desktop app, the stale-transcript guard (`refreshIfTranscriptStale`) refuses every send to a long (302-message) session with a non-converging "conversation is stale" toast, permanently locking the user out of that session even after an app restart.

## #124006 [issue_open] [Bug]: `ultra` reasoning effort is sent unclamped on gpt-6 models, silencing the gateway with a non-retryable 400 (clamp gated on literal "gpt-5.6")
labels: ['type/bug', 'comp/agent', 'provider/openai', 'P2', 'sweeper:risk-compatibility']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.98): The Codex transport sends the unsupported `ultra` reasoning effort unchanged for gpt-6 models, causing every request to fail with a non-retryable HTTP 400 and silencing the gateway.
- **longcat-2.0** (bug, comp/acp, P2, conf 0.9): The `ultra` reasoning effort is sent unclamped to the Codex Responses endpoint for `gpt-6` models because the clamp is gated on a literal `gpt-5.6` string, causing non-retryable HTTP 400 errors and silent gateway failure.
- **deepseek-v4.1-flash** (bug, comp/agent, P2, conf 0.85): The `ultra` reasoning effort is only clamped to the accepted wire value `max` when the model string contains the literal "gpt-5.6", so on newer Codex models like `gpt-6-astra` it is sent unclamped and every call fails with a non-retryable HTTP 400, silencing the gateway.

## #123787 [issue_open] [Bug]: Email attachments lose their filename when it has a space, ';' or non-ASCII characters
labels: ['type/bug', 'comp/plugins', 'platform/email', 'P3', 'sweeper:risk-message-delivery']
- **space-bunny-alpha** (bug, comp/plugins, P2, conf 0.99): Outgoing email attachments lose or corrupt filenames containing spaces, semicolons, or non-ASCII characters because `_attach_file` builds an invalid unquoted Content-Disposition header.
- **longcat-2.0** (bug, comp/plugins, P2, conf 0.85): Email attachments lose their filename when the name contains spaces, semicolons, or non-ASCII characters because the email adapter's _attach_file builds the Content-Disposition header via string interpolation instead of using add_header's filename parameter.
- **deepseek-v4.1-flash** (bug, comp/plugins, P2, conf 0.88): Outgoing email attachments with spaces, semicolons, or non-ASCII characters in the filename are sent with malformed Content-Disposition headers, so receivers see truncated names or do not recognize the attachment.

## #123971 [issue_open] Windows: hermes update always fails its post-relaunch gateway check (exit 1) when the Desktop started the gateway
labels: ['type/bug', 'comp/cli', 'comp/gateway', 'P2', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/gateway, P2, conf 0.98): On Windows, gateway PID detection rejects Hermes' inline-source launcher command line, causing desktop-triggered updates to delete valid identity files, repeatedly replace the running gateway, and falsely fail post-update verification.
- **longcat-2.0** (bug, comp/cli, P2, conf 0.9): On Windows, `hermes update` always fails its post-relaunch gateway verification (exit 1) when the Desktop started the gateway because the identity matchers reject the inline-source command line that `bin/hermes.cmd` uses, even though the update itself succeeded.
- **deepseek-v4.1-flash** (bug, comp/gateway, P2, conf 0.82): On Windows, `hermes update` always exits 1 because the post-relaunch gateway liveness check cannot identify a gateway started by the Desktop via an inline-source command line, and the failed verification also deletes a running gateway's identity files and re-spawns it.

## #123768 [issue_open] Live compression config silently aborts on non-ContextCompressor context engines (`_coerce_threshold_tokens_cap`)
labels: ['type/bug', 'duplicate', 'comp/tui', 'comp/plugins', 'P3', 'sweeper:risk-session-state', 'area/compression']
- **space-bunny-alpha** (bug, comp/tui, P2, conf 0.99): Live compression configuration updates partially apply and then silently stop for non-ContextCompressor context engines because session compression calls a compressor-specific private method on the engine object.
- **longcat-2.0** (bug, comp/tui, P2, conf 0.95): Live compression config edits silently fail to apply to the session when using a non-ContextCompressor context engine because a private staticmethod is called as a bound method on the engine object.
- **deepseek-v4.1-flash** (bug, comp/tui, P2, conf 0.88): Live compression-config edits silently fail to reach sessions when a non-ContextCompressor context engine (e.g. hermes-lcm's LCMEngine) is active, because tui_gateway/session_compression.py calls the ContextCompressor staticmethod _coerce_threshold_tokens_cap as a bound method on the engine object, raising a swallowed AttributeError.

## #123781 [issue_open] [Bug]: `/skin MyTheme` answers "Unknown skin: mytheme" for a user skin with capitals in its name
labels: ['type/bug', 'comp/cli', 'P3']
- **space-bunny-alpha** (bug, comp/cli, P2, conf 0.99): The CLI lowercases skin names before lookup, preventing user skins with capital letters from being selected and making case-insensitive commands fail.
- **longcat-2.0** (bug, comp/cli, P2, conf 0.92): The CLI's /skin command lowercases its argument before matching against available skins, so user skins with capital letters in their names (e.g. MyTheme) can never be selected even though they are listed and offered by completion.
- **deepseek-v4.1-flash** (bug, comp/cli, P2, conf 0.95): The CLI's /skin command lowercases its argument before matching against available skins, so user skins whose names contain uppercase letters can never be selected.

## #123988 [issue_open] fix(tui_gateway): allocate file.attach uploads atomically
labels: ['type/bug', 'comp/tui', 'tool/file', 'P2', 'area/profiles']
- **space-bunny-alpha** (bug, comp/tui, P2, conf 0.99): The TUI gateway's file.attach path can overwrite concurrent same-name uploads and leave partial files after write failures.
- **longcat-2.0** (bug, comp/tui, P1, conf 0.95): Concurrent file.attach uploads with the same sanitized filename in the TUI gateway can race on the existence check, causing the later upload to silently overwrite the earlier one and leaving partial bytes if a write fails.
- **deepseek-v4.1-flash** (bug, comp/tui, P2, conf 0.9): The TUI gateway's file.attach upload path allocates destination filenames with a non-atomic existence check, so concurrent same-name uploads can overwrite each other and failed writes leave partial files behind.

## #123832 [issue_open] [Bug]: a tool call whose stream drops with no finish_reason runs on a repaired prefix (`timeout: 600` → `6`, a todo list cut short)
labels: ['type/bug', 'comp/agent', 'P1', 'area/streaming']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.98): Tool calls with malformed arguments from a dropped stream are automatically repaired and executed with guessed values instead of triggering the existing truncation retry.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.85): When a chat-completions stream drops mid-tool-call-arguments with no finish_reason, the assembler repairs the partial arguments and executes the tool with guessed values instead of flagging it as truncated and retrying.
- **deepseek-v4.1-flash** (bug, comp/agent, P2, conf 0.82): When a chat-completions stream drops with no finish_reason mid tool-call arguments, the assembler repairs the malformed JSON and executes the tool on guessed/truncated arguments instead of triggering the partial-stream retry.

## #123828 [issue_open] [Feature]: Component-scoped updates — let Desktop-only users skip the ui-tui and web build in `hermes update`
labels: ['type/feature', 'comp/cli', 'P3', 'sweeper:risk-compatibility', 'area/install-update']
- **space-bunny-alpha** (feature, comp/cli, P2, conf 0.99): The hermes update command always installs and builds the TUI and web workspaces, forcing Desktop-only users to pay for unused dependencies and builds.
- **longcat-2.0** (feature, comp/cli, P3, conf 0.82): hermes update unconditionally installs and builds the ui-tui and web dashboard workspaces on every run, so Desktop-only users waste significant update time on components they never use and need a persisted, config-driven way to skip them.
- **deepseek-v4.1-flash** (feature, comp/cli, P3, conf 0.82): `hermes update` unconditionally installs and rebuilds the ui-tui and web workspaces, so Desktop-only users have no way to skip components they never use.

## #120575 [issue_completed] [Feature]: One switch for binary settings — desktop configuration views mix Switch and SegmentedControl
labels: ['type/feature', 'P3', 'comp/desktop', 'comp/dashboard']
- **space-bunny-alpha** (feature, comp/desktop, P3, conf 0.99): Desktop configuration views use inconsistent controls for binary on/off settings instead of the existing canonical Switch.
- **longcat-2.0** (feature, comp/desktop, P3, conf 0.95): Desktop configuration views inconsistently use Switch and SegmentedControl for binary on/off settings instead of a single unified affordance.
- **deepseek-v4.1-flash** (feature, comp/desktop, P3, conf 0.9): Desktop configuration views use inconsistent controls for binary on/off settings, mixing the canonical Switch with SegmentedControl and other idioms.

## #120580 [issue_completed] [Bug]: Desktop re-renders the previous turn's tools and final answer after a new reply when background review is superseded
labels: ['type/bug', 'P2', 'needs-repro', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.98): The desktop renderer appends a previous turn’s tool activity and final answer after a new reply when an in-progress background review is superseded.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.8): The desktop app re-renders the previous turn's tool activity and final answer below a new reply when a background review thread is hard-interrupted (superseded) by the new prompt, causing duplicate content to appear in the UI despite a clean database.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.78): In the desktop app, after a new reply the transcript re-renders the previous turn's tool activity and final answer, apparently because a superseded background-review run emits events the desktop stream treats as belonging to the live turn.

## #119809 [issue_completed] Windows: Desktop stops every profile's messaging gateway before an update but never restarts it on the success path
labels: ['type/bug', 'comp/gateway', 'P1', 'sweeper:risk-message-delivery', 'sweeper:risk-platform-windows', 'comp/desktop', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): After a successful Windows desktop update, all profile messaging gateways remain stopped because the updater suppresses its restart fallback and the desktop restarts gateways only on abort paths.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): On Windows, the desktop app stops every profile's messaging gateway before an update but never restarts it on the success path, leaving gateways down indefinitely until manually restarted.
- **deepseek-v4.1-flash** (bug, comp/desktop, P1, conf 0.85): On Windows, the desktop app stops every profile's messaging gateway before an update hand-off but only restarts them on abort paths, leaving all gateways down after a successful update.

## #121984 [issue_completed] [Bug]: a Desktop SSH backend (serve --isolated) is adopted by the host's own Desktop, misclassified by hermes update, and runs stale code after updates
labels: ['type/bug', 'backend/ssh', 'comp/cli', 'P2', 'sweeper:risk-compatibility', 'comp/desktop', 'area/install-update']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.86): An SSH-isolated Hermes Desktop backend on a remote host is misidentified as a local serve, allowing the host Desktop to adopt it, causing incorrect update handling and stale-code execution after updates.
- **longcat-2.0** (bug, comp/cli, P2, conf 0.55): A `serve --isolated` backend started on a host over SSH by a remote Desktop is wrongly adoptable by that host's own Desktop, misclassified as a manual serve by `hermes update`, and left running stale code after updates because the spawn ledger and update inventory have no notion of remote-client ownership.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.55): An SSH-isolated `hermes serve --isolated` backend started on machine B for a remote Desktop client is indistinguishable from a local serve, so B's own Desktop can adopt it, `hermes update` misclassifies it as a manual serve, and it keeps running stale code after updates.

## #119991 [issue_completed] [Bug]: Dashboard shows "not ready yet, try again" for a corrupt state.db and drops the server's `hermes doctor` instruction
labels: ['type/bug', 'P3', 'comp/dashboard']
- **space-bunny-alpha** (bug, comp/dashboard, P2, conf 0.99): The dashboard discards actionable error messages from structured API error details, so a corrupt state.db shows a generic retry prompt instead of the `hermes doctor` repair instructions.
- **longcat-2.0** (bug, comp/dashboard, P2, conf 0.78): The web dashboard discards the server's structured 503 error detail (e.g. the 'state.db corrupt — run hermes doctor' instruction) and shows a generic 'not ready yet, try again' message because extractDetail in web/src/lib/api-error.ts does not handle object-shaped detail payloads.
- **deepseek-v4.1-flash** (bug, comp/dashboard, P2, conf 0.92): The dashboard's error extraction drops the server's structured 503 detail message (e.g. the `hermes doctor` instruction for a corrupt state.db) and shows a generic "not ready yet" sentence instead.

## #120205 [issue_completed] Windows: foreign_state_db_holders() returns [] so the state.db write-guard / optimize-storage preflight is a silent no-op
labels: ['type/bug', 'comp/agent', 'comp/cli', 'P1', 'sweeper:risk-session-state', 'sweeper:risk-platform-windows', 'platform/windows', 'area/sessions']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.93): On Windows, state database maintenance silently bypasses its write guard because foreign_state_db_holders() always returns an empty list, allowing destructive optimization while other processes hold the database.
- **longcat-2.0** (bug, comp/cli, P1, conf 0.65): On Windows, foreign_state_db_holders() unconditionally returns an empty list, so the state.db write-guard preflight for `hermes sessions optimize-storage`/`prune` (and scheduled maintenance) silently allows FTS rebuild + VACUUM to run while other processes hold the database, instead of refusing as on other platforms.
- **deepseek-v4.1-flash** (bug, comp/cli, P1, conf 0.62): On Windows, foreign_state_db_holders() always returns an empty list, so the state.db write-guard/preflight for `hermes sessions optimize-storage` and `prune` silently allows maintenance (FTS rebuild + VACUUM) while other processes hold the store.

## #122845 [issue_completed] __Hobson_permission_probe__
labels: ['invalid', 'comp/cli', 'P4']
- **space-bunny-alpha** (other, comp/agent, P4, conf 0.18): The issue only contains a permission-probe marker and temporary note, without describing an actionable problem.
- **longcat-2.0** (other, comp/agent, P4, conf 0.1): This issue is a temporary automated permission probe containing no actionable content and appears to be a test or bot artifact rather than a real report.
- **deepseek-v4.1-flash** (other, comp/agent, P4, conf 0.2): A placeholder probe issue titled '__Hobson_permission_probe__' with body 'temporary' contains no actionable problem description.

## #119961 [issue_completed] [Bug]: /compress here N in the default in-place mode drops the kept exchanges from state.db
labels: ['type/bug', 'comp/agent', 'P0', 'sweeper:risk-session-state', 'area/sessions', 'area/compression']
- **space-bunny-alpha** (bug, comp/agent, P0, conf 0.99): In-place manual compression drops the explicitly kept tail exchanges from state.db and can also duplicate carried messages after resume.
- **longcat-2.0** (bug, comp/agent, P0, conf 0.95): In-place `/compress here N` drops the kept last N exchanges from state.db, causing them to be lost on resume.
- **deepseek-v4.1-flash** (bug, comp/agent, P0, conf 0.85): In the default in-place compression mode, `/compress here N` (and `up to here`/`--keep N`) drops the N kept exchanges from state.db, so both model and display history lose them on resume.

## #121347 [issue_completed] [Bug]: xai ignores model.base_url — request and XAI_API_KEY go to api.x.ai instead of the configured relay
labels: ['type/bug', 'comp/cli', 'provider/xai', 'area/config', 'P2']
- **space-bunny-alpha** (bug, comp/cli, P1, conf 0.98): The xai provider ignores model.base_url and sends requests and XAI_API_KEY to the canonical api.x.ai endpoint instead of the configured relay.
- **longcat-2.0** (bug, comp/cli, P2, conf 0.85): The xai provider ignores the configured model.base_url and always sends requests to the canonical https://api.x.ai/v1 URL instead of the user-specified relay.
- **deepseek-v4.1-flash** (bug, comp/cli, P2, conf 0.87): The xai provider ignores a configured model.base_url and sends requests plus XAI_API_KEY to the canonical https://api.x.ai/v1 because _pool_entry_mode_and_url in hermes_cli/runtime_provider.py returns the registry default for xai via _POOL_ENTRY_SIMPLE_MODES without applying the model.base_url fallback other providers use.

## #116879 [issue_not_planned] [Bug]: Corrupt session row crashes SessionEntry.from_dict — unguarded fromisoformat + direct key access
labels: ['type/bug', 'comp/gateway', 'P2', 'sweeper:risk-session-state']
- **space-bunny-alpha** (bug, comp/gateway, P2, conf 0.98): SessionEntry.from_dict raises KeyError or ValueError on corrupt or legacy session records, causing session restore/listing to crash instead of quarantining the bad row.
- **longcat-2.0** (bug, comp/gateway, P2, conf 0.9): A corrupt or legacy session record causes SessionEntry.from_dict in gateway/session.py to raise uncaught KeyError/ValueError from direct key access and unguarded fromisoformat calls, crashing session list/restore instead of quarantining the bad row.
- **deepseek-v4.1-flash** (bug, comp/gateway, P2, conf 0.92): A corrupt or legacy session row causes SessionEntry.from_dict to raise an uncaught KeyError/ValueError from direct key access and datetime.fromisoformat, crashing session restore/list instead of quarantining the bad record.

## #116880 [issue_not_planned] [Bug]: Compression appends synthetic user snapshot with raw list.append, bypassing alternation guard
labels: ['type/bug', 'comp/agent', 'P2', 'sweeper:risk-session-state', 'area/compression']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.99): Conversation compression directly appends a synthetic user snapshot, bypassing role-alternation enforcement and creating adjacent user messages that cause strict providers such as Anthropic and Bedrock to reject the turn.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.95): In conversation_compression.py, a synthetic user snapshot is appended via raw list.append, bypassing the append_message alternation guard and allowing adjacent user roles that cause strict-alternation providers like Anthropic/Bedrock to return 400 errors.
- **deepseek-v4.1-flash** (bug, comp/agent, P2, conf 0.9): In agent/conversation_compression.py the todo-snapshot pass appends a synthetic user message with a raw list.append instead of append_message(), allowing user,user role adjacency that strict-alternation providers reject with a 400 mid-compression.

## #113039 [issue_not_planned] Always approval can serialize a routed profile from merged config
labels: ['type/bug', 'comp/cli', 'area/config', 'P2', 'sweeper:risk-compatibility', 'area/profiles']
- **space-bunny-alpha** (bug, comp/gateway, P0, conf 0.96): Saving the permanent command allowlist can overwrite unrelated routed-profile settings because it reads a merged configuration but writes it back to the routed profile file.
- **longcat-2.0** (bug, comp/acp, P2, conf 0.88): save_permanent_allowlist reads merged launch config via load_config() but writes to the routed profile path via save_config(), causing unrelated routed-profile keys to be overwritten.
- **deepseek-v4.1-flash** (bug, comp/tools, P1, conf 0.6): In a multiplexed/routed profile process, save_permanent_allowlist reads config via load_config() (which may reflect the launch profile's merged/default config) but writes to the routed profile's config path, so unrelated routed-profile keys can be overwritten; it should read via read_raw_config() and only modify command_allowlist.

## #120897 [issue_not_planned] [Bug]: Kaspersky false positive: desktop electron-main.mjs flagged as HEUR:Trojan-PSW.JS.Disco.gen (Windows, build-from-source)
labels: ['type/bug', 'P3', 'comp/desktop', 'platform/windows']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.98): Kaspersky falsely flags the Windows desktop app's unsigned, minified Electron main-process bundle as a password-stealer, leaving intact artifacts reported as high-severity detections.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.85): Kaspersky antivirus falsely flags the desktop Electron app's main-process bundle as a password-stealer Trojan due to heuristic pattern overlap with legitimate secret-handling code.
- **deepseek-v4.1-flash** (other, comp/desktop, P2, conf 0.75): Kaspersky's static file heuristic flags the unsigned, minified desktop Electron main-process bundle electron-main.mjs as a password-stealer trojan (HEUR:Trojan-PSW.JS.Disco.gen), a false positive on the app's own clean build output.

## #115185 [issue_not_planned] [Bug]: SenseNova custom provider: insufficient_quota treated as billing error instead of rate limit
labels: ['type/bug', 'comp/agent', 'P3', 'needs-repro', 'area/billing', 'bug']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.84): SenseNova custom-provider responses with insufficient_quota are incorrectly classified as billing errors rather than rate-limit errors, causing incorrect retry and error handling.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.65): The SenseNova custom provider misclassifies the insufficient_quota error as a billing error rather than a rate-limit error, so it is not retried with backoff as expected.
- **deepseek-v4.1-flash** (bug, comp/agent, P2, conf 0.6): The SenseNova custom provider's insufficient_quota error is misclassified as a billing error rather than a rate limit, causing incorrect error handling.

## #116352 [issue_not_planned] [Bug]: https://support.nousresearch.com/diagnostics/0c51d585-4129-4fa1-8246-5a2a36fd02c0
labels: ['type/bug', 'comp/agent', 'P2', 'needs-repro', 'platform/windows', 'bug']
- **space-bunny-alpha** (bug, comp/agent, P1, conf 0.58): Hermes rejects the user's API key and fails with an internal error while starting replies, preventing programs from using the CLI.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.55): Hermes fails to start replies and reports an internal error, with the user indicating their API key is not working.
- **deepseek-v4.1-flash** (bug, comp/agent, P2, conf 0.4): Hermes reports the user's API key is not working and fails to start replies with an internal error, preventing any use of the agent.

## #123195 [issue_not_planned] Withdrawn — filed in error
labels: ['invalid', 'P3']
- **space-bunny-alpha** (other, comp/agent, P4, conf 0.99): The issue was filed in error, was withdrawn by the reporter, and contains no actionable problem to address.
- **longcat-2.0** (other, comp/agent, P4, conf 0.95): The issue was withdrawn by the reporter as filed in error and contains no actual problem to address.
- **deepseek-v4.1-flash** (other, comp/agent, P4, conf 0.2): The reporter withdrew this issue, stating it was filed in error and should be deleted.

## #114741 [issue_not_planned] [Bug]: Stale-stream watchdog ignored its 600s threshold and fired 23,261s (6.5 h) late — turn hung silently
labels: ['type/bug', 'comp/agent', 'provider/deepseek', 'P2', 'needs-repro', 'area/streaming']
- **space-bunny-alpha** (bug, comp/agent, P1, conf None): The stale-stream watchdog can fail to enforce its 600-second timeout, leaving a hung turn and provider connection open for hours without a user-visible failure signal.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.9): The stale-stream watchdog failed to enforce its 600s threshold and fired 23,261s late, causing a turn to hang silently for 6.5 hours.
- **deepseek-v4.1-flash** (bug, comp/agent, P1, conf 0.82): The stale-stream watchdog failed to enforce its 600s threshold and killed a dead stream only after 23,261s (6.46h), leaving a turn hung silently with no user-visible signal.

## #120215 [issue_not_planned] Desktop: transcript-tail cache can freeze a session on stale content after websocket detach (survives restart)
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop', 'area/sessions']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): The desktop app can permanently display stale transcript content after a session's websocket detaches because the durable transcript-tail cache is not invalidated when authoritative reconciliation fails or does not occur.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.9): The desktop app's transcript-tail cache permanently freezes a session's view on stale content after a websocket detach, surviving app restarts, because the cache paints stale content from localStorage and the authoritative reconcile never lands for detached sessions.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.82): The desktop transcript-tail cache can permanently freeze a session's view on stale content after a websocket detach, persisting across app restarts because the cache entry is never invalidated when the authoritative reconcile fails to land.

## #123949 [pr_open] feat(kanban): add resumable release approval gate
labels: ['type/feature', 'comp/cli', 'comp/gateway', 'area/config', 'P3', 'needs-decision', 'sweeper:risk-compatibility']
- **space-bunny-alpha** (feature, comp/gateway, P2, conf 0.84): Adds a durable, replay-safe release approval gate that validates authenticated environment-specific approvals and invokes a versioned adapter with resumable leases and explicit failure behavior.
- **longcat-2.0** (feature, comp/gateway, P2, conf 0.8): The system lacks a durable, replay-safe release approval gate that survives interruptions and enforces approval across idle and busy gateway paths.
- **deepseek-v4.1-flash** (feature, comp/gateway, P2, conf 0.6): The kanban workflow lacks a durable, replay-safe release approval gate that intercepts the authenticated 'freigegeben' reply in gateway paths and invokes a versioned adapter contract with lease-based resume and receipt validation.

## #123950 [pr_open] fix(agent): shield the protect_first_n head from the Phase-1 tool-result prune (#123935)
labels: ['type/bug', 'comp/agent', 'P2', 'sweeper:risk-session-state', 'area/compression']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.99): Phase-1 tool-result pruning can demote or truncate tool results in the protected head, causing important early context such as kanban task-card facts to be lost after compression.
- **longcat-2.0** (bug, comp/agent, P2, conf 0.95): The Phase-1 tool-result prune in ContextCompressor does not respect the protect_first_n head boundary, demoting critical early-turn tool results before the summarization phase can protect them.
- **deepseek-v4.1-flash** (bug, comp/agent, P2, conf 0.92): ContextCompressor._prune_old_tool_results() starts its demote/truncate passes at index 0, so tool results inside the protect_first_n head (e.g. a kanban_show task card) get stubbed on first compaction.

## #123872 [pr_open] fix(desktop): let progressing catalog downloads outlive the deadline
labels: ['type/bug', 'tool/skills', 'P2', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): Desktop Discover aborts slow but progressing catalog downloads after a fixed 60-second total timeout instead of allowing them to finish as long as data continues arriving.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.9): Desktop Discover aborts healthy slow catalog transfers after 60 seconds because the total fetch timeout cannot be renewed by continued byte progress on the response body.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.85): Desktop Discover aborts a healthy but slow catalog download after a fixed 60-second total deadline, reporting it as a user-aborted request.

## #124004 [pr_open] fix(kanban): route review handoffs to valid reviewers
labels: ['type/bug', 'comp/cli', 'comp/cron', 'area/config', 'P3', 'sweeper:risk-compatibility', 'sweeper:risk-automation']
- **space-bunny-alpha** (bug, comp/plugins, P2, conf 0.89): Kanban review handoffs are omitted or targeted to stale reviewer names instead of a deterministic installed reviewer profile.
- **longcat-2.0** (bug, comp/dashboard, P2, conf 0.9): Review handoffs in the kanban board were being routed to invalid or stale reviewers, causing failures.
- **deepseek-v4.1-flash** (bug, comp/dashboard, P2, conf 0.82): Kanban review handoffs can target stale or invalid reviewer profiles, so review work is not routed to a valid reviewer; this PR resolves handoffs to a deterministic installed profile and adds an optional kanban.default_reviewer setting.

## #123905 [pr_open] fix(homeassistant): no-op state_changed events no longer consume the cooldown (salvage #12083)
labels: ['type/bug', 'comp/gateway', 'comp/plugins', 'P2', 'sweeper:risk-message-delivery']
- **space-bunny-alpha** (bug, comp/plugins, P2, conf 0.99): Home Assistant no-op state_changed events incorrectly started the per-entity cooldown, causing subsequent real state changes to be dropped for 30 seconds.
- **longcat-2.0** (bug, comp/plugins, P2, conf 0.9): The Home Assistant adapter stamped the per-entity cooldown before deciding whether to forward a state_changed event, so dropped attribute-only updates started the 30s window and real state changes immediately after were silently discarded.
- **deepseek-v4.1-flash** (bug, comp/plugins, P2, conf 0.9): Home Assistant attribute-only state_changed events (old state == new state) consume the per-entity cooldown, so a real state change arriving within the cooldown window is silently dropped.

## #123932 [pr_open] fix(runtime): skip billing-benched Nous before configured fallback
labels: ['type/bug', 'comp/agent', 'comp/cli', 'provider/nous', 'P2', 'area/billing']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.96): New sessions can resolve and use a billing-benched Nous credential before attempting the configured fallback, causing an avoidable failing inference request.
- **longcat-2.0** (bug, comp/gateway, P2, conf 0.85): New sessions resolve a billing-benched Nous JWT singleton before attempting the configured fallback chain, causing an avoidable failing inference request.
- **deepseek-v4.1-flash** (bug, comp/agent, P2, conf 0.65): New sessions can resolve the singleton Nous JWT even when the credential is billing-benched, causing an avoidable failing inference request before the configured fallback is attempted.

## #122922 [pr_merged] fix(desktop): render reasoning effort as a badge chip, not part of the model name
labels: ['type/bug', 'P3', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): The desktop model catalog renders reasoning effort as inline text appended to the model name, making it appear to be part of the model’s name instead of a separate setting.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.95): Reasoning effort was rendered as inline text appended to the model name in the desktop model catalog menu, causing users to misread it as part of the model name.
- **deepseek-v4.1-flash** (bug, comp/desktop, P3, conf 0.9): In the desktop model catalog menu, reasoning effort (and other meta values) is rendered as plain text appended to the model name, making it look like part of the model name rather than a separate setting.

## #122923 [pr_merged] fix(desktop): track one unscoped stream pin per session
labels: ['type/bug', 'P2', 'sweeper:risk-session-state', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P1, conf 0.99): Concurrent desktop chat streams can misroute unscoped gateway events to the wrong session, causing conversation deltas, tool events, and reasoning to leak into another transcript.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.92): A single shared unscoped-stream pin in the desktop gateway-event router let a second concurrently streaming chat overwrite the first's pin, grafting one conversation's deltas, tool events, and reasoning onto another chat's transcript.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.9): A single shared unscopedStreamSessionId pin in the desktop gateway-event router lets concurrently streaming chats overwrite each other's pin, so one session's stream deltas and tool events get grafted onto another session's transcript.

## #122295 [pr_merged] fix(desktop): log what ssh did when an SSH connect fails
labels: ['type/bug', 'backend/ssh', 'P3', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.98): Desktop SSH connection failures are silently swallowed without logging the SSH process exit code, termination signal, or stderr, making the underlying failure impossible to diagnose.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.9): SSH connection failures in the desktop app produce no diagnostic logs showing exit code, signal, or stderr, making failures impossible to debug.
- **deepseek-v4.1-flash** (bug, comp/desktop, P3, conf 0.8): Desktop SSH-mode connect failures return a classified error but log nothing about exit code, signal, or stderr, so the cause of the macOS SSH drop cannot be diagnosed.

## #123220 [pr_merged] test: make the home-IO guard cheap enough for the cron soak to finish
labels: ['type/test', 'comp/cron', 'P2']
- **space-bunny-alpha** (bug, comp/cron, P2, conf 0.97): The autouse HomeIOGuard makes the cron end-to-end soak exceed its 900-second CI limit because its per-syscall path containment checks consume excessive CPU.
- **longcat-2.0** (bug, comp/cron, P2, conf 0.6): The e2e cron soak test was being SIGKILLed at the 900s CI per-file cap because the autouse HomeIOGuard fixture added ~611μs of Path-building overhead to every guarded syscall, exhausting the test's time budget.
- **deepseek-v4.1-flash** (other, comp/cron, P2, conf 0.55): The e2e cron soak test is SIGKILLed at the 900s per-file cap because the autouse HomeIOGuard's check() is too slow (~611μs per guarded syscall), so the PR rewrites it to make the same decision on case-folded strings for a ~40× speedup.

## #122841 [pr_merged] fix(processes): persist_on_release keeps background jobs alive across lifecycle kill sweeps
labels: ['type/bug', 'comp/agent', 'comp/cli', 'comp/gateway', 'comp/tools', 'comp/tui', 'tool/terminal', 'P2', 'sweeper:risk-session-state', 'area/sessions']
- **space-bunny-alpha** (bug, comp/agent, P2, conf 0.98): Background terminal jobs are terminated during agent lifecycle cleanup even when the user explicitly requests that they persist beyond the session.
- **longcat-2.0** (feature, comp/plugins, P2, conf 0.7): Background terminal processes are unconditionally killed by agent-lifecycle cleanup sweeps (session release, gateway turn timeout, agent close), so long-running jobs the user asked for die mid-run when the session turns over, with no way to opt out.
- **deepseek-v4.1-flash** (feature, comp/tools, P2, conf 0.65): Background terminal jobs cannot opt out of agent-lifecycle kill sweeps, so long-running jobs the user explicitly requested are SIGTERM'd mid-run when the session turns over.

## #122900 [pr_merged] fix(desktop): stop home-directory repo scans when no roots are configured
labels: ['type/bug', 'comp/cli', 'area/config', 'P2', 'sweeper:risk-compatibility', 'comp/desktop']
- **space-bunny-alpha** (bug, comp/desktop, P2, conf 0.99): Desktop startup scanned the user's entire home directory when no repository scan roots were configured, causing unnecessary filesystem traversal and potentially accessing macOS TCC-protected locations.
- **longcat-2.0** (bug, comp/desktop, P2, conf 0.85): An empty desktop.repo_scan_roots config caused the Desktop app to silently scan the user's entire home directory on every launch (including macOS TCC-protected locations) with no way to restrict the traversal short of disabling discovery.
- **deepseek-v4.1-flash** (bug, comp/desktop, P2, conf 0.9): An empty desktop.repo_scan_roots config silently caused the Desktop app to scan the user's entire home directory on every launch, so the fix makes empty roots a safe no-op that requires explicit opt-in configuration.

## #124001 [pr_merged] Plugin catalog is readable in light mode (salvage #123809)
labels: ['type/bug', 'P3', 'Plugin Catalog']
- **space-bunny-alpha** (bug, comp/plugins, P2, conf 0.98): The plugin catalog, plugin detail pages, and author pages have insufficient text and control contrast in light mode.
- **longcat-2.0** (bug, comp/plugins, P2, conf 0.85): Plugin catalog, plugin pages, and author pages had poor text contrast in light mode, making them unreadable.
- **deepseek-v4.1-flash** (bug, comp/dashboard, P2, conf 0.6): The plugin catalog and related plugin/author pages are unreadable in light mode because of low-contrast colors.

## #122894 [pr_closed_unmerged] feat(memory): expose raw transcript to opt-in checkpoints
labels: ['type/feature', 'comp/agent', 'comp/plugins', 'P3', 'sweeper:risk-session-state', 'area/memory', 'area/compression']
- **space-bunny-alpha** (feature, comp/agent, P4, conf 0.98): Opt-in v2 checkpoint providers cannot archive the complete pre-compression transcript because the existing normalized message handoff omits raw tool output.
- **longcat-2.0** (feature, comp/agent, P2, conf 0.85): The v2 checkpoint evidence list normalizes messages and omits tool output, preventing external archival providers from accessing the complete original transcript before lossy compaction.
- **deepseek-v4.1-flash** (feature, comp/agent, P3, conf 0.85): v2 memory checkpoint providers only receive normalized messages that omit tool output, so external archival providers cannot access the complete pre-compression transcript.

## #122904 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: ['type/refactor', 'comp/tui', 'P3', 'comp/desktop']
- **space-bunny-alpha** (other, comp/cli, P4, conf 0.35): This pull request automatically applies JavaScript lint fixes and formatting changes to improve repository style compliance.
- **longcat-2.0** (other, comp/dashboard, P3, conf 0.3): JavaScript files in the repository have lint issues and formatting inconsistencies that need to be automatically corrected.
- **deepseek-v4.1-flash** (other, comp/dashboard, P4, conf 0.35): An auto-generated formatting PR applies `npm run fix` to auto-fix lint and formatting issues in the JavaScript codebase.

## #121799 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: []
- **space-bunny-alpha** (other, comp/cli, P3, conf 0.35): The repository contains JavaScript lint and formatting issues that are automatically corrected to maintain consistent code style.
- **longcat-2.0** (other, comp/agent, P3, conf 0.6): This PR auto-fixes JavaScript lint issues and formatting errors by running `npm run fix`.
- **deepseek-v4.1-flash** (other, comp/cli, P4, conf 0.35): The repository contains lint/formatting issues in JS files that need to be auto-fixed by running `npm run fix`.

## #123668 [pr_closed_unmerged] fix(cron): read the committed generation for Windows cron scripts
labels: ['type/bug', 'comp/cron', 'P1', 'sweeper:risk-compatibility', 'sweeper:risk-platform-windows', 'platform/windows', 'area/install-update']
- **space-bunny-alpha** (bug, comp/cron, P1, conf 0.99): Windows cron scripts could load incompatible site-packages from a stale in-tree virtual environment, causing compiled dependencies such as pydantic_core to fail with a missing-module error.
- **longcat-2.0** (bug, comp/cron, P1, conf 0.7): Windows cron scripts were spawned with a PYTHONPATH overlaying a stale pre-PM venv built for a different Python interpreter, killing every script with ModuleNotFoundError for pydantic_core._pydantic_core.
- **deepseek-v4.1-flash** (bug, comp/cron, P1, conf 0.9): On Windows PM-managed installs, cron scripts are spawned with the wrong interpreter's site-packages, causing every script to fail with `No module named 'pydantic_core._pydantic_core'`.

## #122315 [pr_closed_unmerged] fmt(js): `npm run fix` auto-fix
labels: ['type/refactor', 'comp/tui', 'comp/plugins', 'P3', 'sweeper:risk-automation', 'comp/desktop']
- **space-bunny-alpha** (other, comp/agent, P3, conf 0.35): Automated `npm run fix` resolves JavaScript lint and formatting issues in the repository.
- **longcat-2.0** (other, comp/dashboard, P3, conf 0.4): JavaScript code has lint and formatting issues that need to be auto-fixed.
- **deepseek-v4.1-flash** (other, comp/dashboard, P4, conf 0.35): An auto-generated workflow PR applies `npm run fix` to auto-fix JavaScript lint and formatting issues in the repository.

