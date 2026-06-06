# Pygmalion System Registry

## SSOT (Sources of Truth)
- PostgreSQL `acts_log`
- `tools/replay-core.js`
- `core/canon/emission-policy.js`

## Canon Layer
- Grammar Engine: `backend/core/grammar-engine.js`
- Bridge Symbols: `backend/core/canon/bridges.js`
- Protocols: `backend/core/canon/protocols.js` (::про.1:: – ::про.12::)
- Ontology: `backend/core/canon/ontology.js`
- Temporal: `backend/core/canon/temporal.js`
- Reserved: `backend/core/canon/reserved.js`
- Silence Phase: 19:55–20:00 UTC
- Burn Rules: 24h active / 28h impulse

## Runtime
- `backend-v0.4.1.TEST` (v0.5.1000.01, Stage 2/Pilot 1000)
- Backend: `backend/server.js` (Express, port 3001)
- PostgreSQL: port 5433 (Docker)
- Docker: **broken** — com.docker.service access denied (NET HELPMSG 5)
- PostgreSQL local: **not available**
- metronome.js: `backend/core/metronome.js`
- API Gateway key: `PYGMALION_API_KEY` (header)

## Protocols
| ID | Full Name | File |
|----|-----------|------|
| про.1 | ::про.1.П.Л.А.Н.:: | `protocols/protocol-01-PLAN.js` |
| про.2 | ::про.2.Т.О.К.-О.Р.А.К.У.Л.-С.:: | `protocols/protocol-02-TOK.js` |
| про.3 | ::про.3.К.О.Л.ЛИЦО-ОБЛИК.:: | `protocols/protocol-03-KOL.js` |
| про.4 | ::про.4.В.Е.С.:: | `protocols/protocol-04-VES.js` |

## Frontend
- `field.html` (Canvas 2D)
- `observer.html` (Telemetry)
- `/api/presence`

## External Memory
- NotebookLM
- GitHub
- AI-SYSTEM-MAP.md

## Milestones Status
- ❌ Controlled Circulation Test (Phase 3.8) — **not executed** (Docker/PostgreSQL unavailable)
- ❌ Replay Test — **not executed** (no database connection)
- ✅ Canon Layer: `emission-policy.js`, `metronome.js`, `replay-core.js` — code verified present
- ✅ All 4 backend core files confirmed at correct paths
- ✅ Canon SSOT (`emission-policy.js`) — v1.1, triads T1–T5 (Phase 1) + T6–T17 (Stage 2), ethical stopcock active
- ✅ Terminology: У.Е. (Учётная Единица) = Recognition Unit (R.U.), У.М. (Учётный Маркер) = Recognition Marker (R.M.) — константа, не переменная
- ✅ Mechanics: R.U. → transfer → R.M. (двухфазная)

## Structure: backend-v0.4.1.TEST

```
backend-v0.4.1.TEST/
├── backend/
│   ├── server.js              ← API Gateway (Express, 2,648 lines)
│   ├── server — копия.js.md   ← копия документации
│   └── core/
│       ├── canon/
│       │   ├── index.js       ← entry (const Canon = require('./core/canon'))
│       │   ├── emission-policy.js  ← SSOT лимитов
│       │   ├── grammar.js
│       │   ├── ontology.js
│       │   ├── temporal.js
│       │   ├── reserved.js
│       │   ├── bridges.js
│       │   ├── protocols.js   ← про.1–про.12
│       │   └── NOTES.md
│       ├── metronome.js       ← фазы времени
│       ├── timeRhythm.js
│       └── grammar-engine.js
├── docs/                      ← ADR, CHRONICLE, REPLAY-TEST и др.
├── tools/                     ← replay-core.js, тесты, миграции
├── sql-schema/                ← schema-v3.0-alpha.sql, schema-v3.1-canonical.sql
├── migrations/                ← 001-005 инициализация БД
├── protocols/                 ← про.1–про.4 реализации
├── docker-compose.yml
├── Dockerfile / Dockerfile.prod
├── VERSION                    ← 0.5.1000.01
└── package.json
```

## Notas
- Docker Desktop: com.docker.service stopped, access denied. Требуется починка или альтернатива.
- Gateway (AWS Bedrock/Claude Haiku 4.5): работает на http://localhost:8000
- Paperclip: установлен, API-only на http://localhost:3100 (заморожен до Phase 4)
