# Architecture Decision Records

Twogether keeps no explanatory comments in code ([ADR 0001](0001-no-code-comments.md)).
The non-obvious *why* behind the code lives here instead. Each ADR names the
modules it covers. Before you change one of those modules, read its ADR, and
update the ADR in the same PR if the decision changes.

| # | Decision | Covers |
|---|---|---|
| [0001](0001-no-code-comments.md) | No code comments; decisions live in ADRs | lint rule, ratchet, `/delete-comment` |
| [0002](0002-authentication-and-sessions.md) | Authentication & sessions | `middleware/auth.js`, `middleware/adminAuth.js`, `middleware/botAuth.js` |
| [0003](0003-application-level-authorization.md) | Application-level authorization & privacy | `lib/eventAccess.js`, `lib/deepDiveAccess.js`, `lib/conflictMediator.js` |
| [0004](0004-server-response-translation.md) | Server-side English via response translation | `middleware/locale.js` |
| [0005](0005-structured-logging-and-correlation.md) | Structured logging & request correlation | `lib/logger.js`, `lib/db-errors.js`, `middleware/logging.js`, `middleware/request-context.js` |
| [0006](0006-shared-ai-budget.md) | One shared, fail-open daily AI budget | `lib/aiUsage.js` |
| [0007](0007-ai-output-shaping-contracts.md) | AI output shaping lives outside providers | `lib/closureAi.js`, `lib/deepDiveAi.js`, `lib/therapyCards.js`, `lib/translationStatus.js` |
| [0008](0008-reflection-judge.md) | LLM-as-judge second pass | `lib/reflectionJudge.js`, `lib/judgeExamples.js` |
| [0009](0009-sophie-conflict-mediator.md) | Sophie conflict mediator: heuristic detection & copy rules | `lib/conflictMediator.js` |
| [0010](0010-freemium-entitlements.md) | Per-couple, time-boxed freemium | `lib/entitlements.js` |
| [0011](0011-payment-gateways-and-receipts.md) | Dependency-free gateways & immutable receipts | `lib/ecpay.js`, `lib/newebpay.js`, `lib/paymentProviders.js`, `lib/receipts.js` |
| [0012](0012-notification-fanout-and-email.md) | Notification fan-out & email | `lib/eventNotify.js`, `lib/emailUnsubscribe.js`, `lib/emailPage.js` |
| [0013](0013-feature-flags.md) | DB-backed feature flags | `lib/featureFlags.js` |
| [0014](0014-media-uploads-and-storage.md) | Media pipeline & Supabase Storage | `lib/media-upload.js`, `lib/supabase-storage.js` |
| [0015](0015-lazy-sweeps-instead-of-cron.md) | Lazy sweeps instead of cron | `lib/momentCheckins.js` |
| [0016](0016-curated-content-catalogs.md) | Curated content catalogs | `lib/aiCompanions.js`, `lib/intimacyNudgeTones.js`, `lib/therapyTopicLibrary.js`, `lib/therapyCards.js`, `lib/playbooks/*` |
| [0017](0017-love-bank-and-qa-pool.md) | 感情存款 auto-deposits & Q&A revenue pool | `lib/loveBankAuto.js`, `lib/qaPool.js` |
| [0018](0018-marketplace-scripts.md) | Marketplace scripts: 18+ classification & bot import | `lib/adultScripts.js`, `lib/marketplaceBotScript.js` |

Format: Context → Decision → Consequences. Keep each one short, and add a new
ADR (or a dated amendment) rather than silently rewriting history.
