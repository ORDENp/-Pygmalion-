/**
 * @file storage.js
 * @description Слой следа ПИГМАЛИОН — хранение, журнал, граф (Канон v1.0)
 * 
 * Архитектура:
 * - crystal_state → оперативная модель (текущее состояние)
 * - ro_dag        → только события (append-only, граф связей)
 * - acts_log      → полный журнал всех актов
 * 
 * Гарантии:
 * - безопасная сериализация
 * - защита от null / повреждений
 * - устойчивость после reload
 * - сгоревшие У.Е. НЕ удаляются — только меняют статус
 */

(function(global) {
    'use strict';

    // ============================================
    // КОНСТАНТЫ И КОНФИГУРАЦИЯ
    // ============================================

    const STORAGE_VERSION = '1.0.0';
    const STATE_VERSION = '1.0.13';

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
        TRIAD_RESET: 'triad_reset'
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

    /**
     * Безопасная десериализация JSON
     * @param {string} jsonStr 
     * @param {*} fallback 
     * @returns {*}
     */
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

    /**
     * Безопасная сериализация в JSON
     * @param {*} data 
     * @returns {string|null}
     */
    function safeStringify(data) {
        try {
            return JSON.stringify(data);
        } catch (e) {
            console.error('[Storage] JSON stringify error:', e);
            return null;
        }
    }

    /**
     * Безопасное чтение из localStorage
     * @param {string} key 
     * @param {*} fallback 
     * @returns {*}
     */
    function safeGet(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return safeParse(value, fallback);
        } catch (e) {
            console.error(`[Storage] Error reading key "${key}":`, e);
            return fallback;
        }
    }

    /**
     * Безопасная запись в localStorage
     * @param {string} key
     * @param {*} data
     * @returns {boolean}
     */
    function safeSet(key, data) {
        try {
            const jsonStr = safeStringify(data);
            if (jsonStr === null) return false;
            
            // Проверка квоты перед записью
            const estimatedSize = jsonStr.length;
            const currentSize = Object.keys(localStorage).reduce((sum, k) => sum + localStorage[k].length, 0);
            const quotaLimit = 5 * 1024 * 1024; // 5MB лимит
            
            if (currentSize + estimatedSize > quotaLimit * 0.9) {
                console.warn(`[Storage] Внимание: заполнено ${Math.round((currentSize / quotaLimit) * 100)}% localStorage`);
                // Автоматическая очистка старых данных при достижении 90%
                if (currentSize + estimatedSize > quotaLimit) {
                    console.warn('[Storage] Автоматическая очистка старых транзакций...');
                    cleanupOldTransactions(100); // Оставляем последние 100 транзакций
                }
            }
            
            localStorage.setItem(key, jsonStr);
            return true;
        } catch (e) {
            console.error(`[Storage] Error writing key "${key}":`, e);
            // Проверяем квоту
            if (e.name === 'QuotaExceededError') {
                console.error('[Storage] CRITICAL: localStorage quota exceeded!');
                // Не используем alert — блокирует UI
                console.warn('⚠️ Хранилище переполнено. Очистите данные в панели разработчика.');
            }
            return false;
        }
    }

    /**
     * Очистка старых транзакций для освобождения места
     * @param {number} keepCount - сколько последних транзакций сохранить
     */
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

    /**
     * Записать 5 начальных У.М. в реестр транзакций (подарок при первом входе)
     * У.Е. №01-05 от тестовых ::01::...::05:: → ::OP𝕯EH 𝕯AP::
     * с интервалом ~30 минут между каждой
     */
    function addInitialGiftTransactions() {
        const state = loadCrystalState();
        if (state.initialGiftGiven) {
            console.log('[Storage] Начальные 5 У.М. уже записаны, пропускаем');
            return false;
        }

        const okKeyRaw = localStorage.getItem('pygmalion_ok_key') || 'OP𝕯EH 𝕯AP';
        const okKey = `::${okKeyRaw.replace(/::/g, '')}::`; // Гарантируем :: границы для цветного О.К.
        const baseDate = new Date('2026-04-01T10:00:00'); // 01.04.26 10:00

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
                isInitialGift: true
            };
            state.transactions.push(tx);
            state.receivedTotal += 1;
            state.todayReceived += 1;
            // Баланс У.М. НЕ увеличиваем — начальные 5 У.М. это базовое признание, не транзакции
            console.log(`[Storage] + У.Е. №${i} от ${fromLabel} → ${okKey} (${tx.timeStr})`);
        }

        state.initialGiftGiven = true;
        saveCrystalState(state);
        console.log(`[Storage] Начальные 5 У.М. записаны. Баланс: ${state.umBalance}`);
        return true;
    }

    /**
     * Получение текущего размера хранилища
     * @returns {Object}
     */
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

    /**
     * Генерация уникального ID акта
     * @returns {string}
     */
    function generateActId() {
        return 'act_' + now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    }

    /**
     * Получение текущего timestamp
     * @returns {number}
     */
    function now() {
        // Используем getInternalTime() если доступна (для поддержки тестового времени)
        if (typeof global.getInternalTime === 'function') {
            return global.getInternalTime().getTime();
        }
        return Date.now();
    }

    // ============================================
    // СТРУКТУРЫ ПО УМОЛЧАНИЮ (СХЕМЫ)
    // ============================================

    /**
     * Пустая структура crystal_state
     */
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
            temporaries: [], // Вр.У.З.
            initialGiftGiven: false // Флаг: начальные 5 У.М. уже записаны
        };
    }

    /**
     * Пустая структура ro_dag
     */
    function emptyDAG() {
        return {
            _version: '1.0',
            _createdAt: null,
            nodes: [],
            edges: []
        };
    }

    /**
     * Пустая структура acts_log
     */
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

    /**
     * Загрузка crystal_state из localStorage
     * @returns {Object}
     */
    function loadCrystalState() {
        const saved = safeGet(KEYS.CRYSTAL_STATE, null);
        
        if (!saved) {
            console.log('[Storage] crystal_state не найден, создаём новый');
            return emptyCrystalState();
        }

        // Миграция при необходимости
        const migrated = migrateCrystalState(saved);
        
        console.log(`[Storage] crystal_state загружен (v${migrated._version}), У.Е.: ${migrated.ueUnits?.length || 0}`);
        return migrated;
    }

    /**
     * Сохранение crystal_state в localStorage
     * @param {Object} state 
     * @returns {boolean}
     */
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

    /**
     * Загрузка ro_dag из localStorage
     * @returns {Object}
     */
    function loadDAG() {
        const saved = safeGet(KEYS.RO_DAG, null);
        
        if (!saved) {
            console.log('[Storage] ro_dag не найден, создаём новый');
            const empty = emptyDAG();
            empty._createdAt = now();
            return empty;
        }

        // Базовая миграция структуры
        if (!saved.nodes) saved.nodes = [];
        if (!saved.edges) saved.edges = [];
        if (!saved._version) saved._version = '0.9';
        
        return saved;
    }

    /**
     * Добавление узла в ro_dag (append-only)
     * @param {Object} node - узел для добавления
     * @param {string} node.id - уникальный ID
     * @param {string} node.type - тип узла (emission, transfer, burned, temporary)
     * @param {number} node.timestamp - время создания
     * @param {Object} node.data - данные узла
     * @returns {Object|null} добавленный узел или null при ошибке
     */
    function addDAGNode(node) {
        const dag = loadDAG();
        
        // Проверка уникальности ID
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

    /**
     * Добавление ребра в ro_dag (связь между узлами)
     * @param {string} fromId - ID исходного узла
     * @param {string} toId - ID целевого узла
     * @param {string} type - тип связи (например, 'follows', 'transfers_to')
     * @param {Object} data - дополнительные данные
     * @returns {boolean}
     */
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

    /**
     * Получение узлов DAG по типу
     * @param {string} type
     * @returns {Array}
     */
    function getDAGNodesByType(type) {
        const dag = loadDAG();
        return dag.nodes.filter(n => n.type === type);
    }

    /**
     * Получение последнего timestamp сгорания У.Е.
     * @returns {number|null} timestamp последнего burn или null
     */
    function getLastBurnTimestamp() {
        const burnedNodes = getDAGNodesByType('burned');
        if (burnedNodes.length === 0) return null;
        
        // Последний burn по timestamp
        const lastBurn = burnedNodes.reduce((latest, node) => 
            node.timestamp > latest ? node.timestamp : latest, 0);
        
        console.log(`[Storage] Последнее сгорание: ${new Date(lastBurn).toLocaleString()}`);
        return lastBurn;
    }

    /**
     * Получение всех узлов DAG
     * @returns {Array}
     */
    function getAllDAGNodes() {
        const dag = loadDAG();
        return dag.nodes;
    }

    /**
     * Загрузка acts_log из localStorage
     * @returns {Object}
     */
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

    /**
     * Добавление акта в журнал (append-only)
     * @param {Object} act 
     * @param {string} act.type - тип акта
     * @param {string} act.actor - кто совершил
     * @param {Object} act.data - данные акта
     * @param {string} [act.dagNodeId] - ссылка на узел DAG
     * @returns {Object|null} добавленный акт или null
     */
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

    /**
     * Получение актов по типу
     * @param {string} type 
     * @returns {Array}
     */
    function getActsByType(type) {
        const log = loadActsLog();
        return log.acts.filter(a => a.type === type);
    }

    /**
     * Получение всех актов
     * @returns {Array}
     */
    function getAllActs() {
        const log = loadActsLog();
        return log.acts;
    }

    // ============================================
    // ВЫСОКОУРОВНЕВЫЕ ФУНКЦИИ (СЛЕД)
    // ============================================

    /**
     * Запись эмиссии в след
     * @param {Object} params
     * @param {string[]} params.triads - массив триад
     * @param {number} params.totalAmount - общее количество У.Е.
     * @param {Array} params.createdUEs - созданные У.Е.
     * @param {string} params.txId - ID транзакции
     * @returns {Object} { dagNode, act }
     */
    function recordEmission(params) {
        // 1. Добавляем узел в DAG
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

        // 2. Добавляем акт в журнал
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

    /**
     * Запись передачи в след
     * @param {Object} params
     * @param {string} params.to - получатель
     * @param {number} params.amount - количество У.Е.
     * @param {number[]} params.ueIds - ID переданных У.Е.
     * @param {string} params.message - сообщение благодарности
     * @param {string} params.txId - ID транзакции
     * @returns {Object} { dagNode, act }
     */
    function recordTransfer(params) {
        // 1. Добавляем узел в DAG
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

        // 2. Добавляем акт в журнал
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

    /**
     * Запись сгорания в след
     * @param {Object} params
     * @param {number} params.amount - количество сгоревших У.Е.
     * @param {number[]} params.ueIds - ID сгоревших У.Е.
     * @param {string} params.txId - ID транзакции
     * @returns {Object} { dagNode, act }
     */
    function recordBurn(params) {
        // 1. Добавляем узел в DAG
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

        // 2. Добавляем акт в журнал
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

    /**
     * Создание Вр.У.З. (временной передачи)
     * @param {Object} params
     * @param {number[]} params.ueIds - ID выбранных У.Е.
     * @param {string} params.to - предполагаемый получатель
     * @param {string} [params.message] - сообщение
     * @returns {Object|null} созданная Вр.У.З.
     */
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
            expiresAt: now() + (5 * 60 * 1000) // 5 минут на подтверждение
        };

        // Записываем в crystal_state
        const state = loadCrystalState();
        if (!state.temporaries) state.temporaries = [];
        state.temporaries.push(temporary);
        saveCrystalState(state);

        // Записываем акт
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

    /**
     * Подтверждение Вр.У.З.
     * @param {string} tempId - ID временного узла
     * @returns {Object|null} обновлённая Вр.У.З.
     */
    function confirmTemporary(tempId) {
        const state = loadCrystalState();
        if (!state.temporaries) return null;

        const idx = state.temporaries.findIndex(t => t.id === tempId);
        if (idx === -1) {
            console.warn(`[Storage] Вр.У.З. ${tempId} не найдена`);
            return null;
        }

        const temp = state.temporaries[idx];
        
        // Проверка срока действия
        if (now() > temp.expiresAt) {
            console.warn(`[Storage] Вр.У.З. ${tempId} истекла`);
            return null;
        }

        // Обновляем статус
        temp.status = TEMPORARY_STATUS.CONFIRMED;
        temp.confirmedAt = now();
        state.temporaries[idx] = temp;
        saveCrystalState(state);

        // Записываем акт
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

    /**
     * Отмена Вр.У.З.
     * @param {string} tempId - ID временного узла
     * @returns {boolean}
     */
    function cancelTemporary(tempId) {
        const state = loadCrystalState();
        if (!state.temporaries) return false;

        const idx = state.temporaries.findIndex(t => t.id === tempId);
        if (idx === -1) return false;

        const temp = state.temporaries[idx];
        temp.status = TEMPORARY_STATUS.CANCELLED;
        state.temporaries[idx] = temp;
        saveCrystalState(state);

        // Записываем акт
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

    /**
     * Получение активных Вр.У.З.
     * @returns {Array}
     */
    function getActiveTemporaries() {
        const state = loadCrystalState();
        if (!state.temporaries) return [];
        
        return state.temporaries.filter(t => 
            t.status === TEMPORARY_STATUS.PENDING && 
            now() < t.expiresAt
        );
    }

    /**
     * Очистка просроченных Вр.У.З.
     * @returns {number} количество удалённых
     */
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

    /**
     * Миграция структуры crystal_state
     * @param {Object} saved 
     * @returns {Object}
     */
    function migrateCrystalState(saved) {
        const template = emptyCrystalState();
        
        // Копируем с дефолтами
        const result = { ...template, ...saved };
        
        // Обязательные массивы
        if (!Array.isArray(result.ueUnits)) result.ueUnits = [];
        if (!Array.isArray(result.transactions)) result.transactions = [];
        if (!result.triadsUsed || typeof result.triadsUsed !== 'object') result.triadsUsed = {};
        
        // Новое поле: temporaries (v1.0.13)
        if (!Array.isArray(result.temporaries)) result.temporaries = [];

        // Числовые поля с дефолтами
        result.umBalance = typeof result.umBalance === 'number' ? result.umBalance : 5;
        result.givenTotal = typeof result.givenTotal === 'number' ? result.givenTotal : 0;
        result.todayGiven = typeof result.todayGiven === 'number' ? result.todayGiven : 0;
        result.receivedTotal = typeof result.receivedTotal === 'number' ? result.receivedTotal : 0;
        result.todayReceived = typeof result.todayReceived === 'number' ? result.todayReceived : 0;
        result.burnedTotal = typeof result.burnedTotal === 'number' ? result.burnedTotal : 0;
        result.todayBurned = typeof result.todayBurned === 'number' ? result.todayBurned : 0;
        result.reputationWeight = typeof result.reputationWeight === 'number' ? result.reputationWeight : 0;

        // Обновляем версию
        result._version = STATE_VERSION;

        return result;
    }

    /**
     * Полная миграция всех хранилищ
     * @returns {Object} отчёт о миграции
     */
    function migrateState() {
        const report = {
            timestamp: now(),
            crystalState: false,
            dag: false,
            actsLog: false
        };

        // Миграция crystal_state
        try {
            const state = loadCrystalState();
            saveCrystalState(state);
            report.crystalState = true;
        } catch (e) {
            console.error('[Storage] Migration failed: crystal_state', e);
        }

        // Инициализация ro_dag (если нет)
        try {
            const dag = loadDAG();
            if (!dag._createdAt) {
                dag._createdAt = now();
                safeSet(KEYS.RO_DAG, dag);
            }
            report.dag = true;
        } catch (e) {
            console.error('[Storage] Migration failed: ro_dag', e);
        }

        // Инициализация acts_log (если нет)
        try {
            const log = loadActsLog();
            if (!log._createdAt) {
                log._createdAt = now();
                safeSet(KEYS.ACTS_LOG, log);
            }
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

    /**
     * Получение статистики хранилища
     * @returns {Object}
     */
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
                crystalState: {
                    size: safeStringify(state)?.length || 0,
                    version: state._version
                },
                dag: {
                    nodes: dag.nodes?.length || 0,
                    edges: dag.edges?.length || 0,
                    size: safeStringify(dag)?.length || 0
                },
                actsLog: {
                    acts: log.acts?.length || 0,
                    size: safeStringify(log)?.length || 0
                }
            },
            ue: {
                total: state.ueUnits?.length || 0,
                active: activeUE,
                impulse: impulseUE,
                burned: burnedUE,
                transferred: transferredUE
            },
            totals: {
                given: state.givenTotal || 0,
                received: state.receivedTotal || 0,
                burned: state.burnedTotal || 0
            },
            temporaries: {
                pending: pendingTemp
            }
        };
    }

    /**
     * Очистка ВСЕХ данных (с подтверждением)
     * @returns {boolean}
     */
    function clearAll() {
        if (!confirm('⚠️ Удалить ВСЕ данные ПИГМАЛИОН?\n\nЭто действие необратимо.')) {
            return false;
        }

        localStorage.removeItem(KEYS.CRYSTAL_STATE);
        localStorage.removeItem(KEYS.RO_DAG);
        localStorage.removeItem(KEYS.ACTS_LOG);
        localStorage.removeItem(KEYS.OK_KEY);
        localStorage.removeItem(KEYS.OK_CREATED);

        console.log('[Storage] Все данные очищены');
        return true;
    }

    /**
     * Экспорт всех данных в JSON (для бэкапа)
     * @returns {string|null}
     */
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

    /**
     * Импорт данных из JSON (восстановление)
     * @param {string} jsonStr 
     * @returns {boolean}
     */
    function importAll(jsonStr) {
        const data = safeParse(jsonStr, null);
        if (!data) {
            console.error('[Storage] Import: invalid JSON');
            return false;
        }

        if (!confirm('⚠️ Заменить ВСЕ данные импортируемыми?\n\nТекущие данные будут потеряны.')) {
            return false;
        }

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
        // Ключи
        KEYS,
        
        // Типы
        ACT_TYPES,
        NODE_TYPES,
        TEMPORARY_STATUS,
        
        // Основные функции
        loadCrystalState,
        saveCrystalState,
        loadDAG,
        addDAGNode,
        addDAGEdge,
        getDAGNodesByType,
        getAllDAGNodes,
        getLastBurnTimestamp,  // НОВОЕ
        loadActsLog,
        appendAct,
        getActsByType,
        getAllActs,
        
        // Высокоуровневые (След)
        recordEmission,
        recordTransfer,
        recordBurn,
        
        // Вр.У.З.
        createTemporary,
        confirmTemporary,
        cancelTemporary,
        getActiveTemporaries,
        cleanupExpiredTemporaries,
        
        // Миграции
        migrateState,
        migrateCrystalState,

        // Диагностика
        getStorageStats,
        getStorageSize,
        clearAll,
        exportAll,
        importAll,

        // Утилиты
        generateActId,
        emptyCrystalState,
        emptyDAG,
        emptyActsLog,
        cleanupOldTransactions,
        addInitialGiftTransactions
    };

    console.log('[Storage] Модуль загружен (v' + STORAGE_VERSION + ')');

})(window);