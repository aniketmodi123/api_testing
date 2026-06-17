# Research Gaps Log

CREATED: 2026-06-16

## Progress

| #   | Feature                           | Folder                 | Status  | New Gaps Found                                                                                                                                                                                                                                              |
| --- | --------------------------------- | ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Variables                         | 04-variables           | done    | 33 gaps (FE components ×6, full dynamic var catalog ~40 tokens vs 3 specced, data scope deferred, initial/current value model deferred, nested `{{}}` edge case, key validation rule, reveal endpoints ×2, 13 new test cases for highlighting/autocomplete) |
| 2   | Workflows / Flows                 | 10-workflows           | done    | 11 gaps found (FE canvas lib, 9 missing block types, 3 trigger types, run viewer, loop engine types, webhook endpoint, 15 UNVERIFIED items flagged)                                                                                                         |
| 3   | OpenAPI Specs + Contract + Diff   | 20-openapi-specs       | done    | 15+ gaps (FE: SpecImportModal, DiffViewer, Editor; BE: spec versioning, bidirectional sync, multi-file import, Git sync, continuous validation hooks, governance engine, expanded format support)                                                           |
| 4   | Monitoring                        | 13-monitoring          | done    | 10 gaps (alert storm prevention, console_log capture + 6-mo retention, retry-on-failure logic, pause/resume endpoint, manual run-now endpoint, alert CRUD endpoints, webhook trigger type, 5-email cap validation, env-deleted edge case, multi-region deferred) |
| 5   | Mock Servers                      | 12-mock-servers        | done    | 12 gaps (full 7-step matching algo, 5 x-mock-* headers, request-capture template helpers, MockCall log model + endpoints, call_count atomic increment, 30-day retention cleanup, delay_ms/match_body/match_headers config fields, no-match 404 logging, private mock deferred, call log auto-refresh polling) |
| 6   | Documentation + Publishing        | 11-documentation       | done    | 11 gaps (slug auto-gen + collision handling, SEO title/desc fields, WYSIWYG vs Markdown editor modes, live preview iframe in PublishModal, double/single layout toggle, brand color + logo + favicon config, secret var stripping in env exposure, RunInAPIPilotButton deeplink, code snippet gen service 4 languages, 60s cache keyed on updated_at, custom domain deferred) |
| 7   | Collaboration (Comments)          | 15-collaboration       | done    | 9 gaps: CommentReaction model missing, context_selector/context_type fields missing, /comments/{id}/reopen endpoint missing, /comments/{id}/replies endpoint missing, reaction CRUD endpoints ×2 missing, MentionAutocomplete component missing, InlineCommentPin position logic missing, PR comment endpoints missing |
| 8   | Version Control (Snapshots)       | 16-version-control     | done    | 12 gaps: Fork model missing, PullRequest model missing, PullRequestReviewer model missing, PullRequestWatcher model missing, fork CRUD endpoints ×4 missing, PR full endpoint set ×10 missing, diff endpoint ×2 missing, 3-strategy merge logic missing, ConflictResolutionPanel component missing, PullRequestReviewView component missing, jsondiffpatch diff renderer missing, snapshot named tag field missing |
| 9   | Governance                        | 23-governance          | done    | 14 gaps: GovernanceGroup model missing, GovernanceGroupWorkspace model missing, GovernanceGroupRule model missing, GovernanceViolation model missing, GovernanceCustomFunction model missing, GovernanceRuleLibrary seed model missing, 10+ new endpoints (groups CRUD, group-workspace assignment, group-rules bulk PUT, custom functions CRUD, import endpoint, violations hide/show, reports ×3), Spectral v6 engine integration missing, built-in library seeding missing, Monaco setModelMarkers integration missing, LintReportPanel jump-to-line missing, HideViolationModal missing, GovernanceReportsDashboard missing |
| 10  | Audit Logs                        | audit-logs             | done    | 8 gaps: 3 new endpoints (actions list, single entry, CSV export), cursor-based pagination missing, AuditLog model missing denormalized fields (actor_email, resource_name, actor_ip, actor_user_agent), full event catalog (~40 events across 9 categories) missing, log_audit_event() helper pattern missing, retention cleanup job missing, full FE (AuditLogPage, FilterBar, DateRangePicker, ActionTypeSelect, AuditLogTable, DetailsDrawer, ExportButton, virtualization) missing |
| 11  | SSE                               | 19-sse                 | done    | 5 gaps: /sse-proxy backend endpoint removed (wrong — Postman uses direct EventSource, no proxy), virtual list (react-virtual) missing, auto-detect logic (Content-Type check) missing, custom-header warning for web mode missing, scroll-lock pattern missing |
| 12  | Authentication                    | 06-authentication      | done    | 2+ gaps (FE/BE: Interactive OAuth 2.0 helper for Auth Code/Implicit grants is missing)                                                                                                                                                                      |
| 13  | Collections                       | 07-collections         | done    | 2+ gaps (FE: CollectionVariablesPanel is missing; FE/BE: Granular per-collection sharing is missing)                                                                                                                                                        |
| 14  | Testing (Assertions + Validation) | 08-testing             | done    | 1+ gap (FE: A user-friendly `AssertionBuilder` UI is missing to complement the declarative JSON engine)                                                                                                                                                     |
| 15  | API Request Builder               | 01-api-request-builder | done    | 3+ gaps (FE: PathVariablesEditor, CodeSnippetModal; BE: multi-language code snippet generation)                                                                                                                                                             |
| 16  | Environments                      | 05-environments        | done    | 7 gaps: CollectionPinnedEnvironment model missing, duplicate endpoint missing, export/import endpoints missing, pin CRUD endpoints ×5 missing, secret masking sentinel pattern missing, Sept 2025 single-value model (no initial/current split) not reflected, full FE (EnvironmentSelector, EnvironmentActionsMenu, ImportEnvironmentModal, PinnedEnvironmentManager, SecretValueInput) missing |
| 17  | Collection Runner                 | 09-collection-runner   | done    | 9 gaps: RunDataFile model missing, CollectionRequestOrder model missing, SSE stream endpoint missing, data file upload/list/delete endpoints missing, run-order GET/PUT endpoints missing, pm.execution.setNextRequest engine logic missing, data file variable injection missing, infinite loop detection missing, full FE (RunConfigForm, DataFileUploader, RunRequestOrderEditor, RunProgressBar, RunResultsTable, RunHistoryList) missing |
| 18  | Workspaces                        | 14-workspaces          | done    | 5 gaps: WorkspaceInvite model missing, invite CRUD endpoints ×3 missing, element-move endpoint missing, team-type auto-membership virtual pattern missing, soft-delete + 30-day recovery missing, full FE (WorkspaceSwitcher, WorkspaceOverviewPage, WorkspaceStatsCard, InviteMemberModal, PendingInvitesList, MoveToWorkspaceModal) missing |
| 19  | GraphQL                           | 17-graphql             | done    | 12 gaps: dedicated GraphQL client missing (APIPilot only had JSON body mode), GraphqlSchemaCache model missing, 5 new BE endpoints (introspect, execute, schema-cache GET/DELETE, subscription/connect), graphql_* columns on Request model missing, 9 FE components missing (GraphqlRequestPane, SchemaExplorer, QueryEditor, VariablesEditor, OperationSelector, ResponsePanel, SubscriptionPanel, SchemaImportModal, IntrospectionRefreshButton), subscription WS relay pattern missing, codemirror-graphql library decision documented |
| 20  | WebSocket                         | 18-websocket           | done    | 14 gaps: WebSocketSession model missing, WebSocketMessage model missing, ws_* fields on Request missing, 7 new BE endpoints missing, SSE relay stream endpoint missing, Socket.IO relay (socket.io-client) missing, variable resolution in WS URL/body missing, 10 FE components missing (RequestPane, ConfigTabs, MessageEditor, MessageLog, MessageRow, MessageSearch, SocketIOListenersPanel, SocketIOArgumentEditor, SessionHistory, SaveMessageModal), react-virtual virtualization missing, WS-only collection constraint not enforced |
| 21  | Assertions                        | assertions             | done    | 3 gaps: AssertionBuilderPanel + 8 sub-components missing (StatusAssertionRow, TextAssertionSection, HeaderAssertionSection, JsonChecksSection, JsonCheckRow, EitherBranchSection, AssertionPresetMenu, AssertionJsonPreview), POST /test-cases/validate-assertion endpoint missing, full predicate reference + path syntax + TypeScript interfaces documented |
| 22  | Test Cases                        | test-cases             | done    | 8 gaps: RequestExample model missing (entirely new feature — Postman Examples), 6 new RequestExample endpoints missing, SaveAsExampleButton missing, ExamplesPanel+ExampleEditor missing, TestCaseListPanel missing, TestCaseEditor+5 sub-tabs missing, TestCaseRunResult missing, POST /file/{file_id}/api/cases + PATCH /case/{id} endpoints missing |
| 23  | Schedules                         | schedules              | done    | 4 gaps: PATCH /toggle + POST /run-now + GET /{id} endpoints missing, entire FE missing (SchedulesPage, ScheduleList, ScheduleCard, ScheduleFormModal, FrequencySelector, SchedulePayloadPicker, ScheduleDetailPanel, ExecutionHistoryList, ExecutionResultDrawer, RunNowButton — 10 components), stale-execution cleanup job missing |
| 24  | Secrets Vault                     | secrets-vault          | done    | 9 gaps: is_secret flag on variable entries missing (schema migration needed), VaultSecret model missing, vault CRUD+reveal endpoints ×5 missing, env var /reveal endpoint missing, secret scrub from run snapshots missing, vault.* prefix resolution missing, 6 FE components missing (SecretValueInput, VaultSecretsPage, VaultSecretRow, AddVaultSecretModal, IsSecretToggle, RevealSecretButton) |
| 25  | Alerts                            | alerts                 | done    | 3 gaps: entire FE missing (AlertsSection, AlertRow, AddAlertModal, AlertTypeIcon, TriggerFlagToggles — 5 components), MonitorAlert model missing (BE gap — alerts currently schedule-only, no monitor-level alerts), alert delivery log missing |
| 26  | Administration                    | 25-administration      | done    | 7 gaps: is_superadmin+is_active fields on User missing, 5 superadmin BE endpoints missing (/admin/users, deactivate, reactivate, stats, health), 10 FE components missing (WorkspaceSettingsPage, MembersTable, InviteMemberForm, PendingInvitesList, RoleSelector, DangerZoneSection, SystemAdminPage, UserListTable, SystemHealthCard, UsageStatsPanel), deactivation auth gate in middleware missing |
| 27  | Multi-Request Groups              | multi-request-groups   | done    | 6 gaps: sidebar multi-select missing (MultiSelectOverlay, BulkActionToolbar, BulkMoveModal), bulk delete/move endpoints ×2 missing, linked request system missing (RequestLink model, Node.linked_to field, 3 link endpoints, LinkBadge+CreateLinkMenuItem+LinkedFromPanel+LinkTargetPicker FE components) |
| 28  | API Request Builder (REDO)        | 01-api-request-builder | done    | 7 gaps: PathVariablesEditor missing, RequestSettingsTab (timeout/SSL/redirects/encode/cookies) missing, CodeSnippetModal missing, POST /api/code-snippet endpoint missing, 33-language code generator matrix documented, auto Content-Type managed-header pattern missing, JSON comment stripping not in spec |
| 29  | API Execution Engine              | 02-api-execution-engine | done    | 8 gaps: script_runner.py (postman-sandbox subprocess) missing, send_request() extraction still pending, full pm.* API surface documented (16 methods), variable re-resolve after pre-request script not in spec, console_log capture missing, redirect method preservation (307/308 vs 301/302) not documented, pm.require() npm/JSR package support missing, ResponseSnapshot missing redirects+tls+console_logs fields |
| 30  | Response Viewer                   | 03-response-viewer     | done    | 9 gaps: ResponseCookiesTab missing, ResponseTestResultsTab missing, ResponseConsoleTab missing, NetworkInfoPopover (IP+TLS) missing, RedirectChainBadge missing, ResponseSearchBar missing, ResponseFilterBar (JSONPath/XPath) missing, BodyVisualizeView (pm.visualizer) missing, SaveResponseButton ("Save as Example" + "Save to File") missing |
| 31  | Security                          | 22-security            | done    | 8 gaps: ClientCertificate model missing, CACertificate model missing, Cookie/CookieJar model missing, 7 certificate endpoints missing, 6 cookie management endpoints missing, CertificateSettingsPage + AddClientCertModal + CACertList FE missing, CookieManagerModal FE missing, CA cert injection into httpx verify= path not specced |
| 32  | gRPC                              | 20-grpc                | done    | 12 gaps: GrpcRequest model missing, ProtoFile model missing, 9 new BE endpoints (proto CRUD, reflect, invoke, stream SSE, stream send/end), 4 streaming method types all missing (was unary only), server reflection missing, multi-file proto compile missing, GrpcRequestPanel + 11 FE components missing, streaming session state (in-memory) pattern missing, SSE-based streaming transport pattern documented |
| 33  | SOAP                              | 21-soap                | done    | 7 gaps: WsdlFile model missing, 5 WSDL endpoints missing (upload, list, operations, envelope gen, delete), SSRF double-check (WSDL URL + extracted endpoint URL) not documented, SOAP 1.1 vs 1.2 differences not documented, WS-Security UsernameToken generation not specced, zeep run_in_executor pattern missing, SoapRequestPanel + WsdlImportModal + WsdlOperationSelector + WsSecurityPanel FE missing |

## New Gaps (features APIPilot is missing entirely)

| Feature      | Gap                                                                                       | Severity | Add to FEATURE_INVENTORY?   |
| ------------ | ----------------------------------------------------------------------------------------- | -------- | --------------------------- |
| 10-workflows | FE FlowCanvas not built; canvas library now decided (React Flow)                          | High     | No — already in feature     |
| 10-workflows | Engine missing loop/collect/evaluate/log step types                                       | High     | No — already in feature     |
| 10-workflows | Webhook trigger endpoint (POST /flow/webhook/{token}) not specified or built              | High     | No — add to spec backlog    |
| 10-workflows | Scheduled trigger integration with flow not built (flow trigger config endpoints missing) | Medium   | No — add to spec backlog    |
| 10-workflows | FlowRunViewer live canvas overlay (block status overlaid on canvas) not specified         | Medium   | No — add to spec backlog    |
| 10-workflows | Port type system (typed handles + connection validation) not in existing spec             | Medium   | No — added to spec.md       |
| 10-workflows | Flow-level variables panel not in existing FE spec                                        | Medium   | No — added to spec.md       |
| 10-workflows | FlowTriggerConfig component (trigger type UI) not in existing FE spec                     | Medium   | No — added to spec.md       |
| 10-workflows | send_request() extraction from execute_direct still pending (blocks all engine work)      | Critical | No — T2 prerequisite        |
| 10-workflows | Optimistic lock / conflict detection on flow save not specified                           | Low      | No — add to spec edge cases |
| 10-workflows | Postman Flows plan gating details unverified — differentiator claim needs live validation | Low      | No — flag for product       |
| 17-graphql | Dedicated GraphQL client entirely missing (APIPilot only had JSON body mode) | P1 | No — already in feature |
| 18-websocket | Socket.IO request type missing entirely | P1 | No — already in feature |
| test-cases | Request Examples (Postman's request+response snapshot feature) missing entirely | P2 | Yes — add as new feature |
| secrets-vault | is_secret flag on variable entries missing (schema migration) | P1 | No — already in feature |
| secrets-vault | VaultSecret model + vault.* reference syntax missing | P2 | No — already in feature |
| multi-request-groups | Linked/reusable requests system missing entirely | P2 | No — already in feature |

---

## Session Summary — 2026-06-16 (Features #19–27)

### Total new gaps found this session: 74

### P1 gaps (must build before launch)
- GraphQL dedicated client (12 gaps) — #19
- WebSocket Socket.IO type + SSE relay + message log model (14 gaps) — #20
- AssertionBuilder FE UI + validate-assertion endpoint (3 gaps) — #21
- TestCaseEditor FE + missing CRUD endpoints (8 gaps) — #22
- is_secret flag schema migration on variables (secrets-vault) — #24
- Secret scrub from run snapshots (secrets-vault) — #24

### P2 gaps (important, not blocking launch)
- Request Examples model + endpoints + FE (test-cases) — #22
- Schedule FE — 10 components + 3 endpoints (schedules) — #23
- VaultSecret model + vault CRUD + reveal endpoints (secrets-vault) — #24
- Alerts FE — 5 components (alerts) — #25
- MonitorAlert model — monitor-level alerts (alerts) — #25
- User deactivation + superadmin model + admin endpoints (administration) — #26
- Workspace admin FE — 10 components (administration) — #26
- Sidebar bulk actions + bulk endpoints (multi-request-groups) — #27
- Linked requests system (multi-request-groups) — #27

### P3 gaps (nice to have)
- Third-party vault integrations (Azure/HashiCorp/AWS) — #24
- pm.execution.runRequest() script API — #27
- Alert delivery log — #25
- SSO/SCIM (administration) — #26

---

## Session Summary — 2026-06-17 (Features #28–33, REDO batch)

### Total new gaps found this session: 51

### #28 — API Request Builder (7 gaps)
- PathVariablesEditor (auto-parse {param}/:param) missing
- RequestSettingsTab (timeout/SSL/redirects/encode/cookies) missing
- CodeSnippetModal + POST /api/code-snippet endpoint missing
- 33-language code generator matrix documented
- Auto Content-Type managed-header pattern missing
- JSON comment stripping in raw body not specced
- extra_meta.settings sub-schema not defined

### #29 — API Execution Engine (8 gaps)
- script_runner.py (postman-sandbox Node subprocess) entirely missing
- send_request() extraction still pending (critical, blocks Flows)
- Full pm.* API surface documented (16 methods)
- Variable re-resolve after pre-request script not specced
- Console log capture (console_logs[] in ResponseSnapshot) missing
- Redirect method preservation (307/308 vs 301/302) not documented
- pm.require("npm:pkg") / JSR package support missing
- ResponseSnapshot schema missing redirects, tls, console_logs fields

### #30 — Response Viewer (9 gaps)
- ResponseCookiesTab, ResponseTestResultsTab, ResponseConsoleTab missing
- NetworkInfoPopover (IP + TLS hover) missing
- RedirectChainBadge missing
- ResponseSearchBar (Ctrl+F) missing
- ResponseFilterBar (JSONPath / XPath) missing
- BodyVisualizeView (pm.visualizer) missing
- SaveResponseButton ("Save as Example" + "Save to File") missing

### #31 — Security (8 gaps)
- ClientCertificate model, CACertificate model, Cookie model all missing
- 7 certificate management endpoints missing
- 6 cookie management endpoints missing
- CertificateSettingsPage + FE components missing
- CookieManagerModal + FE missing
- CA cert injection into httpx verify= path not documented

### #32 — gRPC (12 gaps)
- GrpcRequest model missing
- ProtoFile model lacked detail
- 9 new endpoints missing (proto CRUD, reflect, invoke, SSE stream, send/end)
- Server/client/bidi streaming entirely missing (was unary-only)
- Server reflection missing
- Multi-file proto compile via temp dir not specced
- SSE streaming transport pattern not specced
- In-memory GrpcStreamSession missing
- All 11 FE components missing
- gRPC auth injection via metadata not specced
- gRPC status code catalog missing
- SSRF guard adaptation for gRPC host not specced

### #33 — SOAP (7 gaps)
- WsdlFile model missing
- 5 WSDL endpoints missing
- SSRF double-check (WSDL URL + extracted endpoint URL) not documented
- SOAP 1.1 vs 1.2 differences not documented
- WS-Security UsernameToken generation not specced
- zeep run_in_executor async pattern not specced
- 4 FE components missing

### P1 gaps (must build before launch)
- send_request() extraction from execute_direct (blocks Flows) — #29
- script_runner.py (postman-sandbox) — scripts don't run without this — #29

### P2 gaps (important, not blocking launch)
- PathVariablesEditor + RequestSettingsTab + CodeSnippetModal — #28
- Response viewer missing 9 components — #30
- Security: ClientCert + CACert + Cookie models + all endpoints — #31
- gRPC: GrpcRequest model + all 9 endpoints + 11 FE components (demand-gated) — #32

### P3 gaps (nice to have / demand-gated)
- SOAP Level 2 (WSDL import) — demand-gated — #33
- gRPC mock servers — deferred — #32
- JSONPath/XPath filter in response viewer — #30
