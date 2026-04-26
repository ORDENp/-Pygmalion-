/**
 * @file storage.js
 * @description Слой следа ПИГМАЛИОН — хранение, журнал, граф (Канон v1.0)
 *
 * Архитектура:
 * - crystal_state → оперативная модель (текущее состояние)
 * - ro_dag        → только события (append-only, граф связей)
 * - acts_log      → полный журнал всех актов
 *
 * v0.3.24: добавлены membershipOrders, membershipDepartments, statuses,
 *          unions, councils, crossTransactions, incomingValuations
 */

(function(global) {
    'use strict';

    // ============================================
    // КОНСТАНТЫ И КОНФИГУРАЦИЯ
    // ============================================

    const STORAGE_VERSION = '1.0.1';
    const STATE_VERSION = '1.0.14';  // v0.3.24: добавлены новые поля

    const KEYS = {
        CRYSTAL_STATE: 'crystal_state',
        RO_DAG: 'ro_dag',
        ACTS_LOG: 'acts_log',
        OK_KEY: 'pygmalion_ok_key',
        OK_CREATED: 'pygmalion_ok_created'
    };

    // Типы актов (перечисление)
    const ACT_TYPES = {
        EMISSION: 'emission',
        TRANSFER: 'transfer',
        BURNED: 'burned',
        TEMPORARY_CREATED: 'temporary_created',
        TEMPORARY_CONFIRMED: 'temporary_confirmed',
        TEMPORARY_CANCELLED: 'temporary_cancelled',
        PHASE_CHANGE: 'phase_change',
        TRIAD_RESET: 'triad_reset',
        ORDER_JOIN: 'order_join',
        DEPARTMENT_JOIN: 'department_join',
        UNION_CREATED: 'union_created',
        COUNCIL_CREATED: 'council_created'
    };

    // Типы узлов DAG
    const NODE_TYPES = {
        EMISSION: 'emission',
        TRANSFER: 'transfer',
        BURNED: 'burned',
        TEMPORARY: 'temporary'
    };

    // Статусы Вр.У.З.
    const TEMPORARY_STATUS = {
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        CANCELLED: 'cancelled'
    };

    // ============================================
    // УТИЛИТЫ СЕРИАЛИЗАЦИИ
    // ============================================

    function safeParse(jsonStr, fallback) {
        if (!jsonStr || typeof jsonStr !== 'string') return fallback;
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed === null || parsed === undefined) return fallback;
            return parsed;
        } catch (e) {
            console.error('[Storage] JSON parse error:', e);
            return fallback;
        }
    }

    function safeStringify(data) {
        try {
            return JSON.stringify(data);
        } catch (e) {
            console.error('[Storage] JSON stringify error:', e);
            return null;
        }
    }

    function safeGet(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return safeParse(value, fallback);
        } catch (e) {
            console.error(`[Storage] Error reading key "${key}":`, e);
            return fallback;
        }
    }

    function safeSet(key, data) {
        try {
            const jsonStr = safeStringify(data);
            if (jsonStr === null) return false;

            const estimatedSize = jsonStr.length;
            const currentSize = Object.keys(localStorage).reduce((sum, k) => sum + localStorage[k].length, 0);
            const quotaLimit = 5 * 1024 * 1024;

            if (currentSize + estimatedSize > quotaLimit * 0.9) {
                console.warn(`[Storage] Заполнено ${Math.round((currentSize / quotaLimit) * 100)}% localStorage`);
                if (currentSize + estimatedSize > quotaLimit) {
                    console.warn('[Storage] Очистка старых транзакций...');
                    cleanupOldTransactions(100);
                }
            }

            localStorage.setItem(key, jsonStr);
            return true;
        } catch (e) {
            console.error(`[Storage] Error writing key "${key}":`, e);
            if (e.name === 'QuotaExceededError') {
                console.error('[Storage] CRITICAL: localStorage quota exceeded!');
            }
            return false;
        }
    }

    function cleanupOldTransactions(keepCount) {
        try {
            const state = loadCrystalState();
            if (state.transactions && state.transactions.length > keepCount) {
                const removed = state.transactions.length - keepCount;
                state.transactions = state.transactions.slice(-keepCount);
                saveCrystalState(state);
                console.log(`[Storage] Удалено ${removed} старых транзакций`);
            }
        } catch (e) {
            console.error('[Storage] Ошибка при очистке транзакций:', e);
        }
    }

    function addInitialGiftTransactions() {
        const state = loadCrystalState();
        if (state.initialGiftGiven) {
            console.log('[Storage] Начальные 5 У.М. уже записаны, пропускаем');
            return false;
        }

        // === КАНОН: О.К.-2 — текущий О.К. пользователя (с :: границами) ===
        const rawOK = localStorage.getItem('pygmalion_ok_key') || '';
        const okKey = rawOK ? `::${rawOK.replace(/::/g, '').trim()}::` : '::____::';
        const baseDate = new Date('2026-04-01T10:00:00');

        // === Шуточные сообщения благодарности от тестовых О.К. ===
        const messages = [
            'За первый шаг',
            'За терпение',
            'За вдохновение',
            'За присутствие',
            'За доверие'
        ];

        console.log('[Storage] Запись начальных 5 У.М. в реестр...');

        for (let i = 1; i <= 5; i++) {
            const timestamp = new Date(baseDate.getTime() + (i - 1) * 30 * 60 * 1000).getTime();
            const fromLabel = `::${String(i).padStart(2, '0')}::`;
            const tx = {
                id: `INIT-${String(i).padStart(2, '0')}`,
                type: 'received',
                ueNumber: i,
                from: fromLabel,
                to: okKey,
                amount: 1,
                timestamp: timestamp,
                dateStr: `01.04.26`,
                timeStr: `${String(10 + (i - 1)).padStart(2, '0')}:${i === 1 ? '00' : '30'}`,
                isInitialGift: true,
                message: messages[i - 1]
            };
            state.transactions.push(tx);
            state.receivedTotal += 1;
            state.todayReceived += 1;
            console.log(`[Storage] + У.Е. №${i} от ${fromLabel} → ${okKey} (${tx.timeStr}) «${messages[i - 1]}»`);
        }

        state.initialGiftGiven = true;
        saveCrystalState(state);
        console.log(`[Storage] Начальные 5 У.М. записаны. Баланс: ${state.umBalance}`);
        return true;
    }

    function getStorageSize() {
        let total = 0;
        const details = {};
        Object.keys(localStorage).forEach(key => {
            const size = localStorage[key].length;
            details[key] = size;
            total += size;
        });
        return {
            total: total,
            totalMB: (total / (1024 * 1024)).toFixed(2),
            details: details,
            quotaLimitMB: 5,
            usagePercent: ((total / (5 * 1024 * 1024)) * 100).toFixed(1)
        };
    }

    function generateActId() {
        return 'act_' + now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    }

    function now() {
        if (typeof global.getInternalTime === 'function') {
            return global.getInternalTime().getTime();
        }
        return Date.now();
    }

    // ============================================
    // СТРУКТУРЫ ПО УМОЛЧАНИЮ (СХЕМЫ)
    // ============================================

    function emptyCrystalState() {
        return {
            _version: STATE_VERSION,
            _savedAt: null,
            umBalance: 5,
            lastEmissionTime: null,
            triadsUsed: {},
            givenTotal: 0,
            todayGiven: 0,
            receivedTotal: 0,
            todayReceived: 0,
            burnedTotal: 0,
            todayBurned: 0,
            reputationWeight: 0,
            lastResetDate: null,
            lastTriadsReset: null,
            ueUnits: [],
            transactions: [],
            temporaries: [],
            initialGiftGiven: false,
            // === v0.3.24: Социальная архитектура ===
            membershipOrders: [],         // [{ orderId: '::02::', joinedAt: timestamp }]
            membershipDepartments: [],     // [{ deptId: '::о1::', joinedAt: timestamp, isHead: false }]
            statuses: {                    // Авто-статусы
                current: 'participant',
                participantSince: null,
                coParticipantSince: null,
                coWarriorSince: null,
                warriorSince: null,
                coInvestorSince: null,
                investorSince: null,
                buyoutAmount: 0            // Сумма выкупа от ::о0::
            },
            unions: [],                    // [{ id, name, founder, createdAt, members: [] }]
            councils: [],                  // [{ id, name, department, founder, createdAt, members: [] }]
            incomingValuations: [],        // [{ txIndex, valuation, setAt, setBy }]
            // === v0.3.24: Каркас кросс-транзакций (резерв) ===
            crossTransactions: [],         // [{ id, type: 's0'|'dN'|'cN', initiator, partner, status, createdAt }]
            reservedNumbers: {
                s0: { used: false },       // Сердечная половина (1 шт.)
                d: {},                     // №𝕯0 - №𝕯99 (100 шт.)
                c: {}                      // №с0 - №с999 (1000 шт.)
            },
            primateOK: null,               // О.К. Предстоятеля (::0:: или ::33::)
            departmentHeads: {},           // { '::о0::': '::О.К.::', '::о1::': '::О.К.::', ... }
            orderLeaders: {},              // { '::02::': '::О.К.::', ... } (::01:: — Предстоятель, не лидер)
            tieBreakerUsed: false,         // Флаг использования решающего голоса ::01::.№33.
            // === v0.3.26: Мониторинг активности О.К. ===
            lastActivityDate: null,        // Дата последней трансформации У.Е.→У.М.
            inactiveDays: 0                // Счётчик дней бездействия (порог: 87 дней)
        };
    }

    function emptyDAG() {
        return {
            _version: '1.0',
            _createdAt: null,
            nodes: [],
            edges: []
        };
    }

    function emptyActsLog() {
        return {
            _version: '1.0',
            _createdAt: null,
            acts: []
        };
    }

    // ============================================
    // ОСНОВНЫЕ ФУНКЦИИ ХРАНЕНИЯ
    // ============================================

    function loadCrystalState() {
        const saved = safeGet(KEYS.CRYSTAL_STATE, null);
        if (!saved) {
            console.log('[Storage] crystal_state не найден, создаём новый');
            return emptyCrystalState();
        }
        const migrated = migrateCrystalState(saved);
        console.log(`[Storage] crystal_state загружен (v${migrated._version}), У.Е.: ${migrated.ueUnits?.length || 0}`);
        return migrated;
    }

    function saveCrystalState(state) {
        const toSave = {
            ...state,
            _version: STATE_VERSION,
            _savedAt: now()
        };
        const result = safeSet(KEYS.CRYSTAL_STATE, toSave);
        if (result) {
            console.log(`[Storage] crystal_state сохранён (${now()})`);
        }
        return result;
    }

    function loadDAG() {
        const saved = safeGet(KEYS.RO_DAG, null);
        if (!saved) {
            console.log('[Storage] ro_dag не найден, создаём новый');
            const empty = emptyDAG();
            empty._createdAt = now();
            return empty;
        }
        if (!saved.nodes) saved.nodes = [];
        if (!saved.edges) saved.edges = [];
        if (!saved._version) saved._version = '0.9';
        return saved;
    }

    function addDAGNode(node) {
        const dag = loadDAG();
        if (dag.nodes.some(n => n.id === node.id)) {
            console.warn(`[Storage] DAG: узел ${node.id} уже существует`);
            return null;
        }
        const fullNode = {
            id: node.id,
            type: node.type,
            timestamp: node.timestamp || now(),
            data: node.data || {},
            _createdAt: now()
        };
        dag.nodes.push(fullNode);
        if (safeSet(KEYS.RO_DAG, dag)) {
            console.log(`[Storage] DAG: добавлен узел ${node.id} (${node.type})`);
            return fullNode;
        }
        console.error('[Storage] DAG: ошибка сохранения узла');
        return null;
    }

    function addDAGEdge(fromId, toId, type, data) {
        const dag = loadDAG();
        const edge = {
            from: fromId,
            to: toId,
            type: type || 'related',
            data: data || {},
            _createdAt: now()
        };
        dag.edges.push(edge);
        return safeSet(KEYS.RO_DAG, dag);
    }

    function getDAGNodesByType(type) {
        const dag = loadDAG();
        return dag.nodes.filter(n => n.type === type);
    }

    function getLastBurnTimestamp() {
        const burnedNodes = getDAGNodesByType('burned');
        if (burnedNodes.length === 0) return null;
        const lastBurn = burnedNodes.reduce((latest, node) =>
            node.timestamp > latest ? node.timestamp : latest, 0);
        console.log(`[Storage] Последнее сгорание: ${new Date(lastBurn).toLocaleString()}`);
        return lastBurn;
    }

    function getAllDAGNodes() {
        const dag = loadDAG();
        return dag.nodes;
    }

    function loadActsLog() {
        const saved = safeGet(KEYS.ACTS_LOG, null);
        if (!saved) {
            console.log('[Storage] acts_log не найден, создаём новый');
            const empty = emptyActsLog();
            empty._createdAt = now();
            return empty;
        }
        if (!saved.acts) saved.acts = [];
        if (!saved._version) saved._version = '0.9';
        return saved;
    }

    function appendAct(act) {
        const log = loadActsLog();
        const fullAct = {
            id: generateActId(),
            type: act.type,
            timestamp: act.timestamp || now(),
            actor: act.actor || 'current_user',
            data: act.data || {},
            dagNodeId: act.dagNodeId || null,
            _createdAt: now()
        };
        log.acts.push(fullAct);
        if (safeSet(KEYS.ACTS_LOG, log)) {
            console.log(`[Storage] acts_log: добавлен акт ${fullAct.id} (${act.type})`);
            return fullAct;
        }
        console.error('[Storage] acts_log: ошибка сохранения акта');
        return null;
    }

    function getActsByType(type) {
        const log = loadActsLog();
        return log.acts.filter(a => a.type === type);
    }

    function getAllActs() {
        const log = loadActsLog();
        return log.acts;
    }

    // ============================================
    // ВЫСОКОУРОВНЕВЫЕ ФУНКЦИИ (СЛЕД)
    // ============================================

    function recordEmission(params) {
        const dagNode = addDAGNode({
            id: params.txId,
            type: NODE_TYPES.EMISSION,
            timestamp: now(),
            data: {
                triads: params.triads,
                totalAmount: params.totalAmount,
                ueIds: params.createdUEs.map(ue => ue.id),
                phase: typeof TimeRhythm !== 'undefined'
                    ? TimeRhythm.getSystemPhase(now())
                    : 'unknown'
            }
        });
        const act = appendAct({
            type: ACT_TYPES.EMISSION,
            actor: 'current_user',
            data: {
                triads: params.triads,
                totalAmount: params.totalAmount,
                ueIds: params.createdUEs.map(ue => ue.id),
                ueDetails: params.createdUEs
            },
            dagNodeId: params.txId
        });
        return { dagNode, act };
    }

    function recordTransfer(params) {
        const dagNode = addDAGNode({
            id: params.txId,
            type: NODE_TYPES.TRANSFER,
            timestamp: now(),
            data: {
                from: 'current_user',
                to: params.to,
                amount: params.amount,
                ueIds: params.ueIds,
                message: params.message,
                phase: typeof TimeRhythm !== 'undefined'
                    ? TimeRhythm.getSystemPhase(now())
                    : 'unknown'
            }
        });
        const act = appendAct({
            type: ACT_TYPES.TRANSFER,
            actor: 'current_user',
            data: {
                to: params.to,
                amount: params.amount,
                ueIds: params.ueIds,
                message: params.message
            },
            dagNodeId: params.txId
        });
        return { dagNode, act };
    }

    function recordBurn(params) {
        const dagNode = addDAGNode({
            id: params.txId,
            type: NODE_TYPES.BURNED,
            timestamp: now(),
            data: {
                amount: params.amount,
                ueIds: params.ueIds,
                phase: typeof TimeRhythm !== 'undefined'
                    ? TimeRhythm.getSystemPhase(now())
                    : 'unknown'
            }
        });
        const act = appendAct({
            type: ACT_TYPES.BURNED,
            actor: 'system',
            data: {
                amount: params.amount,
                ueIds: params.ueIds
            },
            dagNodeId: params.txId
        });
        return { dagNode, act };
    }

    // ============================================
    // ВР.У.З. (ВРЕМЕННЫЕ УЗЛЫ)
    // ============================================

    function createTemporary(params) {
        const tempId = 'tmp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        const temporary = {
            id: tempId,
            type: 'temporary',
            status: TEMPORARY_STATUS.PENDING,
            createdAt: now(),
            ueIds: params.ueIds,
            to: params.to || '',
            message: params.message || '',
            confirmedAt: null,
            expiresAt: now() + (5 * 60 * 1000)
        };
        const state = loadCrystalState();
        if (!state.temporaries) state.temporaries = [];
        state.temporaries.push(temporary);
        saveCrystalState(state);
        appendAct({
            type: ACT_TYPES.TEMPORARY_CREATED,
            actor: 'current_user',
            data: {
                temporaryId: tempId,
                ueIds: params.ueIds,
                to: params.to
            }
        });
        console.log(`[Storage] Вр.У.З. создана: ${tempId}`);
        return temporary;
    }

    function confirmTemporary(tempId) {
        const state = loadCrystalState();
        if (!state.temporaries) return null;
        const idx = state.temporaries.findIndex(t => t.id === tempId);
        if (idx === -1) {
            console.warn(`[Storage] Вр.У.З. ${tempId} не найдена`);
            return null;
        }
        const temp = state.temporaries[idx];
        if (now() > temp.expiresAt) {
            console.warn(`[Storage] Вр.У.З. ${tempId} истекла`);
            return null;
        }
        temp.status = TEMPORARY_STATUS.CONFIRMED;
        temp.confirmedAt = now();
        state.temporaries[idx] = temp;
        saveCrystalState(state);
        appendAct({
            type: ACT_TYPES.TEMPORARY_CONFIRMED,
            actor: 'current_user',
            data: {
                temporaryId: tempId,
                ueIds: temp.ueIds,
                to: temp.to
            }
        });
        console.log(`[Storage] Вр.У.З. подтверждена: ${tempId}`);
        return temp;
    }

    function cancelTemporary(tempId) {
        const state = loadCrystalState();
        if (!state.temporaries) return false;
        const idx = state.temporaries.findIndex(t => t.id === tempId);
        if (idx === -1) return false;
        const temp = state.temporaries[idx];
        temp.status = TEMPORARY_STATUS.CANCELLED;
        state.temporaries[idx] = temp;
        saveCrystalState(state);
        appendAct({
            type: ACT_TYPES.TEMPORARY_CANCELLED,
            actor: 'current_user',
            data: {
                temporaryId: tempId,
                reason: 'user_cancelled'
            }
        });
        console.log(`[Storage] Вр.У.З. отменена: ${tempId}`);
        return true;
    }

    function getActiveTemporaries() {
        const state = loadCrystalState();
        if (!state.temporaries) return [];
        return state.temporaries.filter(t =>
            t.status === TEMPORARY_STATUS.PENDING &&
            now() < t.expiresAt
        );
    }

    function cleanupExpiredTemporaries() {
        const state = loadCrystalState();
        if (!state.temporaries) return 0;
        const before = state.temporaries.length;
        state.temporaries = state.temporaries.filter(t =>
            t.status === TEMPORARY_STATUS.PENDING
                ? now() < t.expiresAt
                : t.status !== TEMPORARY_STATUS.CANCELLED
        );
        const removed = before - state.temporaries.length;
        if (removed > 0) {
            saveCrystalState(state);
            console.log(`[Storage] Очищено просроченных Вр.У.З.: ${removed}`);
        }
        return removed;
    }

    // ============================================
    // МИГРАЦИИ
    // ============================================

    function migrateCrystalState(saved) {
        const template = emptyCrystalState();
        const result = { ...template, ...saved };

        // Обязательные массивы
        if (!Array.isArray(result.ueUnits)) result.ueUnits = [];
        if (!Array.isArray(result.transactions)) result.transactions = [];
        if (!Array.isArray(result.temporaries)) result.temporaries = [];
        if (!result.triadsUsed || typeof result.triadsUsed !== 'object') result.triadsUsed = {};

        // === v0.3.24: Новые поля социальной архитектуры ===
        if (!Array.isArray(result.membershipOrders)) result.membershipOrders = [];
        if (!Array.isArray(result.membershipDepartments)) result.membershipDepartments = [];
        if (!Array.isArray(result.unions)) result.unions = [];
        if (!Array.isArray(result.councils)) result.councils = [];
        if (!Array.isArray(result.incomingValuations)) result.incomingValuations = [];
        if (!Array.isArray(result.crossTransactions)) result.crossTransactions = [];

        if (!result.statuses || typeof result.statuses !== 'object') {
            result.statuses = {
                current: 'participant',
                participantSince: result.lastEmissionTime || now(),
                coParticipantSince: null,
                coWarriorSince: null,
                warriorSince: null,
                coInvestorSince: null,
                investorSince: null,
                buyoutAmount: 0
            };
        } else {
            // Дополняем缺失 поля
            if (!result.statuses.current) result.statuses.current = 'participant';
            if (!result.statuses.participantSince) result.statuses.participantSince = result.lastEmissionTime || now();
            if (result.statuses.buyoutAmount === undefined) result.statuses.buyoutAmount = 0;
        }

        if (!result.reservedNumbers) {
            result.reservedNumbers = { s0: { used: false }, d: {}, c: {} };
        } else {
            if (!result.reservedNumbers.s0) result.reservedNumbers.s0 = { used: false };
            if (!result.reservedNumbers.d) result.reservedNumbers.d = {};
            if (!result.reservedNumbers.c) result.reservedNumbers.c = {};
        }

        if (!result.primateOK) result.primateOK = null;
        if (!result.departmentHeads || typeof result.departmentHeads !== 'object') result.departmentHeads = {};
        if (!result.orderLeaders || typeof result.orderLeaders !== 'object') result.orderLeaders = {};
        if (result.tieBreakerUsed === undefined) result.tieBreakerUsed = false;

        // Числовые поля
        result.umBalance = typeof result.umBalance === 'number' ? result.umBalance : 5;
        result.givenTotal = typeof result.givenTotal === 'number' ? result.givenTotal : 0;
        result.todayGiven = typeof result.todayGiven === 'number' ? result.todayGiven : 0;
        result.receivedTotal = typeof result.receivedTotal === 'number' ? result.receivedTotal : 0;
        result.todayReceived = typeof result.todayReceived === 'number' ? result.todayReceived : 0;
        result.burnedTotal = typeof result.burnedTotal === 'number' ? result.burnedTotal : 0;
        result.todayBurned = typeof result.todayBurned === 'number' ? result.todayBurned : 0;
        result.reputationWeight = typeof result.reputationWeight === 'number' ? result.reputationWeight : 0;

        result._version = STATE_VERSION;
        return result;
    }

    function migrateState() {
        const report = { timestamp: now(), crystalState: false, dag: false, actsLog: false };
        try {
            const state = loadCrystalState();
            saveCrystalState(state);
            report.crystalState = true;
        } catch (e) {
            console.error('[Storage] Migration failed: crystal_state', e);
        }
        try {
            const dag = loadDAG();
            if (!dag._createdAt) { dag._createdAt = now(); safeSet(KEYS.RO_DAG, dag); }
            report.dag = true;
        } catch (e) {
            console.error('[Storage] Migration failed: ro_dag', e);
        }
        try {
            const log = loadActsLog();
            if (!log._createdAt) { log._createdAt = now(); safeSet(KEYS.ACTS_LOG, log); }
            report.actsLog = true;
        } catch (e) {
            console.error('[Storage] Migration failed: acts_log', e);
        }
        console.log('[Storage] Migration complete:', report);
        return report;
    }

    // ============================================
    // ДИАГНОСТИКА
    // ============================================

    function getStorageStats() {
        const state = loadCrystalState();
        const dag = loadDAG();
        const log = loadActsLog();

        const activeUE = state.ueUnits?.filter(ue => ue.status === 'active' && ue.amount > 0).length || 0;
        const impulseUE = state.ueUnits?.filter(ue => ue.status === 'impulse' && ue.amount > 0).length || 0;
        const burnedUE = state.ueUnits?.filter(ue => ue.status === 'burned').length || 0;
        const transferredUE = state.ueUnits?.filter(ue => ue.status === 'transferred').length || 0;
        const pendingTemp = getActiveTemporaries().length;

        return {
            timestamp: now(),
            storage: {
                crystalState: { size: safeStringify(state)?.length || 0, version: state._version },
                dag: { nodes: dag.nodes?.length || 0, edges: dag.edges?.length || 0, size: safeStringify(dag)?.length || 0 },
                actsLog: { acts: log.acts?.length || 0, size: safeStringify(log)?.length || 0 }
            },
            ue: { total: state.ueUnits?.length || 0, active: activeUE, impulse: impulseUE, burned: burnedUE, transferred: transferredUE },
            totals: { given: state.givenTotal || 0, received: state.receivedTotal || 0, burned: state.burnedTotal || 0 },
            temporaries: { pending: pendingTemp },
            social: {
                orders: state.membershipOrders?.length || 0,
                departments: state.membershipDepartments?.length || 0,
                unions: state.unions?.length || 0,
                councils: state.councils?.length || 0,
                status: state.statuses?.current || 'participant'
            }
        };
    }

    function clearAll() {
        if (!confirm('⚠️ Удалить ВСЕ данные ПИГМАЛИОН?\n\nЭто действие необратимо.')) return false;
        localStorage.removeItem(KEYS.CRYSTAL_STATE);
        localStorage.removeItem(KEYS.RO_DAG);
        localStorage.removeItem(KEYS.ACTS_LOG);
        localStorage.removeItem(KEYS.OK_KEY);
        localStorage.removeItem(KEYS.OK_CREATED);
        console.log('[Storage] Все данные очищены');
        return true;
    }

    function exportAll() {
        const data = {
            _exportVersion: STORAGE_VERSION,
            _exportedAt: now(),
            crystalState: loadCrystalState(),
            dag: loadDAG(),
            actsLog: loadActsLog(),
            okKey: localStorage.getItem(KEYS.OK_KEY),
            okCreated: localStorage.getItem(KEYS.OK_CREATED)
        };
        return safeStringify(data);
    }

    function importAll(jsonStr) {
        const data = safeParse(jsonStr, null);
        if (!data) { console.error('[Storage] Import: invalid JSON'); return false; }
        if (!confirm('⚠️ Заменить ВСЕ данные импортируемыми?\n\nТекущие данные будут потеряны.')) return false;
        try {
            if (data.crystalState) safeSet(KEYS.CRYSTAL_STATE, data.crystalState);
            if (data.dag) safeSet(KEYS.RO_DAG, data.dag);
            if (data.actsLog) safeSet(KEYS.ACTS_LOG, data.actsLog);
            if (data.okKey) localStorage.setItem(KEYS.OK_KEY, data.okKey);
            if (data.okCreated) localStorage.setItem(KEYS.OK_CREATED, data.okCreated);
            console.log('[Storage] Импорт выполнен успешно');
            return true;
        } catch (e) {
            console.error('[Storage] Import error:', e);
            return false;
        }
    }

    // ============================================
    // ЭКСПОРТ МОДУЛЯ
    // ============================================

    global.Storage = {
        KEYS,
        ACT_TYPES,
        NODE_TYPES,
        TEMPORARY_STATUS,

        loadCrystalState,
        saveCrystalState,
        loadDAG,
        addDAGNode,
        addDAGEdge,
        getDAGNodesByType,
        getAllDAGNodes,
        getLastBurnTimestamp,
        loadActsLog,
        appendAct,
        getActsByType,
        getAllActs,

        recordEmission,
        recordTransfer,
        recordBurn,

        createTemporary,
        confirmTemporary,
        cancelTemporary,
        getActiveTemporaries,
        cleanupExpiredTemporaries,

        migrateState,
        migrateCrystalState,

        getStorageStats,
        getStorageSize,
        clearAll,
        exportAll,
        importAll,

        generateActId,
        emptyCrystalState,
        emptyDAG,
        emptyActsLog,
        cleanupOldTransactions,
        addInitialGiftTransactions
    };

    console.log('[Storage] Модуль загружен (v' + STORAGE_VERSION + ')');

})(window);
