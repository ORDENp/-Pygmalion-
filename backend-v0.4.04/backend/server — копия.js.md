const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cron = require('node-cron');
const Metronome = require('./core/metronome');

const app = express();

app.use(cors());
app.use(express.json());

// --------------------------------------------------
// PostgreSQL connection (raw, без ORM)
// --------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// --------------------------------------------------
// Константы триад (канон Pygmalion)
// --------------------------------------------------

const TRIADS = {
  T1: { name: 'Знания', range: [1, 2, 3], ueCount: 3 },
  T2: { name: 'Практики', range: [4, 5, 6], ueCount: 3 },
  T3: { name: 'Творчество', range: [7, 8, 9], ueCount: 3 },
  T4: { name: 'Досуг/ЗОЖ', range: [10, 11, 12], ueCount: 3 },
  T5: { name: '№21', range: [21], ueCount: 1 }
};

const MAX_UE_PER_PERIOD = 26;

// --------------------------------------------------
// Utils (минимальные проверки)
// --------------------------------------------------

const OK_REGEX = /^::[0-9A-Za-z._-]+::$/;

function isValidOK(ok) {
  return typeof ok === 'string' && OK_REGEX.test(ok);
}

function isValidActType(type) {
  const validTypes = [
    'EMISSION', 'TRANSFER', 'BURNED', 'RECOGNITION',
    'THRESHOLD_CROSSED',
    'TEMPORARY_CREATED', 'TEMPORARY_CONFIRMED', 'TEMPORARY_CANCELLED',
    'PHASE_CHANGE', 'TRIAD_RESET',
    'ORDER_JOIN', 'DEPARTMENT_JOIN', 'UNION_CREATED', 'COUNCIL_CREATED',
    'SUCCESSION'
  ];
  return validTypes.includes(type);
}

function isValidTriad(triad) {
  return Object.keys(TRIADS).includes(triad);
}

function getUENumbersByTriad(triad) {
  return TRIADS[triad] ? TRIADS[triad].range : [];
}

function validateTriadSelection(triads) {
  // Проверка: все триады валидны
  for (const triad of triads) {
    if (!isValidTriad(triad)) {
      return { valid: false, error: `Invalid triad: ${triad}` };
    }
  }

  // Проверка: T5 доступна только после активации хотя бы одной триады T1-T4
  const hasT5 = triads.includes('T5');
  const hasRegularTriad = triads.some(t => ['T1', 'T2', 'T3', 'T4'].includes(t));

  if (hasT5 && !hasRegularTriad) {
    return { valid: false, error: 'T5 (У.Е. №21) доступна только после активации хотя бы одной триады T1-T4' };
  }

  // Подсчёт общего количества У.Е.
  let totalUE = 0;
  triads.forEach(triad => {
    totalUE += TRIADS[triad].ueCount;
  });

  // Проверка: минимум 3 У.Е. (одна триада)
  if (totalUE < 3) {
    return { valid: false, error: 'Минимум 3 У.Е. (одна триада T1-T4)' };
  }

  // Проверка: максимум 13 У.Е. (все триады)
  if (totalUE > 13) {
    return { valid: false, error: 'Максимум 13 У.Е. (T1+T2+T3+T4+T5)' };
  }

  return { valid: true, totalUE };
}

// --------------------------------------------------
// ro.DAG — выбор родительских узлов
// --------------------------------------------------

async function selectParentRefs(actor_ok, limit = 3) {
  // Выбираем 2-3 последних акта О.К. для формирования refs
  const result = await pool.query(
    `
    SELECT act_id
    FROM acts_log
    WHERE actor_ok = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [actor_ok, limit]
  );

  return result.rows.map(row => row.act_id);
}

// --------------------------------------------------
// Этика ритма — проверка пауз созревания (cooldown)
// --------------------------------------------------

const COOLDOWN_PERIODS = {
  THRESHOLD_CROSSED: 60 * 60 * 1000,      // 1 час до первого акта
  EMISSION: 10 * 60 * 1000,               // 10 минут между эмиссиями
  RECOGNITION: 5 * 60 * 1000,             // 5 минут между признаниями
  TRANSFER: 15 * 60 * 1000                // 15 минут между передачами
};

async function checkCooldown(actor_ok, act_type) {
  // Получить последний акт О.К.
  const result = await pool.query(
    `
    SELECT last_act_at, last_act_type
    FROM ok_identity
    WHERE ok_key = $1
    `,
    [actor_ok]
  );

  if (result.rows.length === 0) {
    // О.К. не существует
    return { allowed: false, reason: 'OK does not exist' };
  }

  const { last_act_at, last_act_type } = result.rows[0];

  // Если это первый акт О.К.
  if (!last_act_at) {
    return { allowed: true };
  }

  const now = new Date();
  const lastActTime = new Date(last_act_at);
  const timeSinceLastAct = now - lastActTime;

  // Проверка 1: Пауза после THRESHOLD_CROSSED (1 час наблюдения)
  if (last_act_type === 'THRESHOLD_CROSSED') {
    const cooldown = COOLDOWN_PERIODS.THRESHOLD_CROSSED;
    if (timeSinceLastAct < cooldown) {
      const remainingMs = cooldown - timeSinceLastAct;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return {
        allowed: false,
        reason: 'cooldown_after_threshold',
        message: `Время наблюдения. Первый акт созреет через ${remainingMinutes} мин.`,
        remaining_ms: remainingMs
      };
    }
    return { allowed: true };
  }

  // Проверка 2: Пауза между актами одного типа
  if (last_act_type === act_type && COOLDOWN_PERIODS[act_type]) {
    const cooldown = COOLDOWN_PERIODS[act_type];
    if (timeSinceLastAct < cooldown) {
      const remainingMs = cooldown - timeSinceLastAct;
      const remainingMinutes = Math.ceil(remainingMs / 60000);

      const messages = {
        EMISSION: `Следующий импульс созреет через ${remainingMinutes} мин.`,
        RECOGNITION: `Следующее признание созреет через ${remainingMinutes} мин.`,
        TRANSFER: `Следующая передача созреет через ${remainingMinutes} мин.`
      };

      return {
        allowed: false,
        reason: 'cooldown_same_type',
        message: messages[act_type] || `Пауза созревания: ${remainingMinutes} мин.`,
        remaining_ms: remainingMs
      };
    }
  }

  return { allowed: true };
}

async function updateLastAct(actor_ok, act_type) {
  // Обновить last_act_at и last_act_type после успешного акта
  await pool.query(
    `
    UPDATE ok_identity
    SET last_act_at = NOW(), last_act_type = $2
    WHERE ok_key = $1
    `,
    [actor_ok, act_type]
  );
}

// --------------------------------------------------
// Цикл присутствия — определение фазы
// --------------------------------------------------

async function determineCyclePhase(ok_id, mirrorData) {
  const { trace, ro_dag_status, ue_flow, directions, burn } = mirrorData;
  const { last_act_at, silence_hours } = trace;

  // Фаза 1: Gestation (Созревание)
  // О.К. существует, но нет актов (кроме THRESHOLD_CROSSED)
  if (!last_act_at || (ue_flow === 0 && directions.given === 0 && !ro_dag_status.received_um)) {
    return {
      phase: 'gestation',
      phase_duration_hours: silence_hours || 0,
      next_phase: 'awakening',
      next_phase_at: null,
      hint: 'Наблюдайте поле. Первый импульс созреет через паузу.'
    };
  }

  // Фаза 2: Awakening (Пробуждение)
  // Первый акт совершён, но нет признания
  if (!ro_dag_status.received_um && (ue_flow > 0 || directions.given > 0)) {
    return {
      phase: 'awakening',
      phase_duration_hours: silence_hours || 0,
      next_phase: 'recognition',
      next_phase_at: null,
      hint: 'Ваше присутствие зафиксировано. Ожидайте признания.'
    };
  }

  // Фаза 3: Recognition (Признание)
  // Получено первое признание, вход в Древо
  if (ro_dag_status.received_um && !ro_dag_status.in_tree && ue_flow === 0) {
    return {
      phase: 'recognition',
      phase_duration_hours: silence_hours || 0,
      next_phase: 'weaving',
      next_phase_at: null,
      hint: 'Вы вошли в Древо Инициаторов.'
    };
  }

  // Фаза 5: Release (Освобождение)
  // Burn Echo активен
  if (burn.burn_echo?.active) {
    const nextBurnAt = Metronome.calculateBurnAt();
    return {
      phase: 'release',
      phase_duration_hours: 1, // Echo длится 1 час
      next_phase: 'cooling',
      next_phase_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      hint: 'Выдох системы. Импульсы сгорели.'
    };
  }

  // Фаза 6: Cooling (Остывание)
  // 1h < silence < 24h
  if (silence_hours > 1 && silence_hours < 24 && ue_flow === 0) {
    return {
      phase: 'cooling',
      phase_duration_hours: silence_hours,
      next_phase: 'silence',
      next_phase_at: new Date(Date.now() + (24 - silence_hours) * 60 * 60 * 1000).toISOString(),
      hint: 'Поле остывает. ОБЛИК остаётся.'
    };
  }

  // Фаза 7: Silence (Тишина)
  // silence > 24h, но < 7 дней
  if (silence_hours >= 24 && silence_hours < 168 && ue_flow === 0) {
    return {
      phase: 'silence',
      phase_duration_hours: silence_hours,
      next_phase: 'settled',
      next_phase_at: new Date(Date.now() + (168 - silence_hours) * 60 * 60 * 1000).toISOString(),
      hint: 'Тишина. ОБЛИК держится.'
    };
  }

  // Фаза 8: Settled (Устойчивость)
  // silence >= 7 дней
  if (silence_hours >= 168 && ue_flow === 0) {
    return {
      phase: 'settled',
      phase_duration_hours: silence_hours,
      next_phase: null,
      next_phase_at: null,
      hint: 'ОБЛИК кристаллизован.'
    };
  }

  // Фаза 4: Weaving (Плетение) — по умолчанию для активного состояния
  // Активное участие (ue_flow > 0)
  const nextBurnAt = Metronome.calculateBurnAt();
  return {
    phase: 'weaving',
    phase_duration_hours: silence_hours || 0,
    next_phase: 'release',
    next_phase_at: nextBurnAt,
    hint: 'Поле живёт. Следующее сгорание в полночь UTC.'
  };
}

// --------------------------------------------------
// ::про.1:: / ::про.2:: — запись акта (ФАКТ)
// --------------------------------------------------

app.post('/api/acts', async (req, res) => {
  const { act_type, actor_ok, target_ok, payload } = req.body;

  try {
    // --- базовая валидация ---
    if (!isValidActType(act_type)) {
      return res.status(400).json({ error: 'Invalid act_type' });
    }

    if (!isValidOK(actor_ok)) {
      return res.status(400).json({ error: 'Invalid actor_ok format' });
    }

    if (target_ok && !isValidOK(target_ok)) {
      return res.status(400).json({ error: 'Invalid target_ok format' });
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // --- Проверка пауз созревания (Этика ритма) ---
    const cooldownCheck = await checkCooldown(actor_ok, act_type);
    if (!cooldownCheck.allowed) {
      return res.status(429).json({
        error: 'Cooldown active',
        message: cooldownCheck.message,
        reason: cooldownCheck.reason,
        remaining_ms: cooldownCheck.remaining_ms
      });
    }

    // --- Проверка роли Предстоятеля (::00::) ---
    const isPredstoyatel = actor_ok === '::00::';

    // --- EMISSION: валидация триад ---
    if (act_type === 'EMISSION') {
      const { triads } = payload;

      if (!triads || !Array.isArray(triads) || triads.length === 0) {
        return res.status(400).json({ error: 'EMISSION requires triads array' });
      }

      // Проверка фазы системы через Metronome
      const phase = Metronome.getCurrentPhase();

      // КРИТИЧНО: Эмиссия запрещена в зоне тишины (19:55-20:00)
      if (phase === 'silence') {
        return res.status(400).json({
          error: 'Эмиссия запрещена в зоне тишины (19:55-20:00 UTC). Подождите до 20:00.'
        });
      }

      // Валидация триад по канону
      const validation = validateTriadSelection(triads);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Расширенные лимиты для Предстоятеля (::00::)
      const maxUEPerDay = isPredstoyatel ? 13 : 6;

      // Проверка лимита на период
      const window_start = Metronome.getWindowStart();
      const emittedResult = await pool.query(
        `
        SELECT COALESCE(SUM((payload->>'total_ue')::int), 0) as emitted
        FROM acts_log
        WHERE actor_ok = $1
          AND act_type = 'EMISSION'
          AND created_at >= $2::timestamp
        `,
        [actor_ok, window_start]
      );

      const emittedThisPeriod = parseInt(emittedResult.rows[0].emitted) || 0;

      if (emittedThisPeriod + validation.totalUE > maxUEPerDay) {
        return res.status(400).json({
          error: `Превышен лимит ${maxUEPerDay} У.Е. на период. Уже эмитировано: ${emittedThisPeriod}`
        });
      }

      // Определяем burnAt через Metronome
      const burnAt = Metronome.calculateBurnAt();
      const status = phase === 'impulse' ? 'impulse' : 'active';

      // Формируем детерминированный payload
      const emissionPayload = {
        triads: triads,
        burn_at: burnAt,
        phase: phase,
        total_ue: validation.totalUE
      };

      // Начинаем транзакцию
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Выбираем родительские акты для ro.DAG
        const parentRefs = await selectParentRefs(actor_ok, 3);

        // Записываем акт эмиссии с детерминированным payload и refs
        const actResult = await client.query(
          `INSERT INTO acts_log (act_type, actor_ok, payload, refs)
           VALUES ($1, $2, $3, $4)
           RETURNING act_id, created_at`,
          [act_type, actor_ok, emissionPayload, parentRefs]
        );

        const act_id = actResult.rows[0].act_id;
        const created_at = actResult.rows[0].created_at;

        // Создаём У.Е. для каждой триады
        const createdUEs = [];
        for (const triad of triads) {
          const ueNumbers = getUENumbersByTriad(triad);
          for (const ueNumber of ueNumbers) {
            const ueResult = await client.query(
              `INSERT INTO ue_units (
                ue_number, triad, actor_ok, status,
                created_at, burn_at, emission_act_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING ue_uuid`,
              [ueNumber, triad, actor_ok, status, created_at, burnAt, act_id]
            );
            createdUEs.push({
              ue_uuid: ueResult.rows[0].ue_uuid,
              ue_number: ueNumber,
              triad: triad,
              status: status
            });
          }
        }

        await client.query('COMMIT');

        // Обновить last_act для cooldown
        await updateLastAct(actor_ok, act_type);

        res.json({
          success: true,
          act_id: act_id,
          created_at: created_at,
          ue_units: createdUEs,
          phase: phase,
          burn_at: burnAt
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // --- TRANSFER: валидация У.Е. ---
    else if (act_type === 'TRANSFER') {
      const { ue_uuid } = payload;

      if (!ue_uuid) {
        return res.status(400).json({ error: 'TRANSFER requires ue_uuid' });
      }

      if (!target_ok) {
        return res.status(400).json({ error: 'TRANSFER requires target_ok' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Проверяем существование и статус У.Е.
        const ueCheck = await client.query(
          `SELECT ue_uuid, ue_number, triad, actor_ok, status, burn_at
           FROM ue_units
           WHERE ue_uuid = $1 AND actor_ok = $2`,
          [ue_uuid, actor_ok]
        );

        if (ueCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'У.Е. не найдена или не принадлежит actor_ok' });
        }

        const ue = ueCheck.rows[0];

        if (ue.status !== 'active') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `У.Е. не активна (статус: ${ue.status})` });
        }

        // Проверяем фазу системы через Metronome
        const phase = Metronome.getCurrentPhase();
        if (phase !== 'active') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Передача доступна только в активной фазе (текущая: ${phase})` });
        }

        // Выбираем родительские акты для ro.DAG
        const parentRefs = await selectParentRefs(actor_ok, 3);

        // Записываем акт передачи с refs
        const actResult = await client.query(
          `INSERT INTO acts_log (act_type, actor_ok, target_ok, payload, refs)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING act_id, created_at`,
          [act_type, actor_ok, target_ok, payload, parentRefs]
        );

        const act_id = actResult.rows[0].act_id;
        const created_at = actResult.rows[0].created_at;

        // Обновляем статус У.Е.
        await client.query(
          `UPDATE ue_units
           SET status = 'transferred',
               transferred_at = $1,
               transfer_act_id = $2,
               actor_ok = $3
           WHERE ue_uuid = $4`,
          [created_at, act_id, target_ok, ue_uuid]
        );

        await client.query('COMMIT');

        // Обновить last_act для cooldown
        await updateLastAct(actor_ok, act_type);

        res.json({
          success: true,
          act_id: act_id,
          created_at: created_at,
          ue_transferred: {
            ue_uuid: ue.ue_uuid,
            ue_number: ue.ue_number,
            triad: ue.triad,
            from: actor_ok,
            to: target_ok
          }
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // --- SUCCESSION: передача роли Предстоятеля (::00::) ---
    else if (act_type === 'SUCCESSION') {
      // Только Предстоятель может инициировать преемственность
      if (actor_ok !== '::00::') {
        return res.status(403).json({ error: 'Только Предстоятель (::00::) может инициировать преемственность' });
      }

      if (!target_ok) {
        return res.status(400).json({ error: 'SUCCESSION requires target_ok (новый Предстоятель)' });
      }

      const { reason } = payload;

      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: 'SUCCESSION requires reason (причина передачи роли)' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Проверяем существование целевого О.К. (должен иметь хотя бы один акт)
        const targetCheck = await client.query(
          `SELECT COUNT(*) as act_count FROM acts_log WHERE actor_ok = $1`,
          [target_ok]
        );

        if (parseInt(targetCheck.rows[0].act_count) === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Целевой О.К. не имеет актов в системе' });
        }

        // Выбираем родительские акты для ro.DAG
        const parentRefs = await selectParentRefs(actor_ok, 3);

        // Записываем акт SUCCESSION
        const successionPayload = {
          reason: reason.trim(),
          from: actor_ok,
          to: target_ok,
          timestamp: new Date().toISOString()
        };

        const actResult = await client.query(
          `INSERT INTO acts_log (act_type, actor_ok, target_ok, payload, refs)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING act_id, created_at`,
          [act_type, actor_ok, target_ok, successionPayload, parentRefs]
        );

        const act_id = actResult.rows[0].act_id;
        const created_at = actResult.rows[0].created_at;

        await client.query('COMMIT');

        res.json({
          success: true,
          act_id: act_id,
          created_at: created_at,
          succession: {
            from: actor_ok,
            to: target_ok,
            reason: reason.trim()
          },
          note: 'Акт SUCCESSION зафиксирован. Смена учётной записи требует ручного вмешательства администратора БД.'
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // --- Управленческие акты с валидацией уникальности ---
    else if (['ORDER_JOIN', 'DEPARTMENT_JOIN', 'UNION_CREATED', 'COUNCIL_CREATED'].includes(act_type)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Проверяем существование аналогичных ролей
        if (act_type === 'ORDER_JOIN') {
          const { order_id } = payload;
          if (!order_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'ORDER_JOIN requires order_id in payload' });
          }

          // Проверяем, не состоит ли О.К. уже в этом Ордене
          const existingMembership = await client.query(
            `SELECT act_id FROM acts_log
             WHERE act_type = 'ORDER_JOIN'
               AND actor_ok = $1
               AND payload->>'order_id' = $2`,
            [actor_ok, order_id]
          );

          if (existingMembership.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `О.К. ${actor_ok} уже состоит в Ордене ${order_id}` });
          }
        }

        if (act_type === 'DEPARTMENT_JOIN') {
          const { department_id } = payload;
          if (!department_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'DEPARTMENT_JOIN requires department_id in payload' });
          }

          // Проверяем, не состоит ли О.К. уже в этом Отделе
          const existingMembership = await client.query(
            `SELECT act_id FROM acts_log
             WHERE act_type = 'DEPARTMENT_JOIN'
               AND actor_ok = $1
               AND payload->>'department_id' = $2`,
            [actor_ok, department_id]
          );

          if (existingMembership.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `О.К. ${actor_ok} уже состоит в Отделе ${department_id}` });
          }
        }

        if (act_type === 'UNION_CREATED') {
          const { union_id } = payload;
          if (!union_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'UNION_CREATED requires union_id in payload' });
          }

          // Проверяем, не существует ли уже Союз с таким ID
          const existingUnion = await client.query(
            `SELECT act_id FROM acts_log
             WHERE act_type = 'UNION_CREATED'
               AND payload->>'union_id' = $1`,
            [union_id]
          );

          if (existingUnion.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Союз ${union_id} уже существует` });
          }
        }

        if (act_type === 'COUNCIL_CREATED') {
          const { council_id } = payload;
          if (!council_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'COUNCIL_CREATED requires council_id in payload' });
          }

          // Проверяем, не существует ли уже Совет с таким ID
          const existingCouncil = await client.query(
            `SELECT act_id FROM acts_log
             WHERE act_type = 'COUNCIL_CREATED'
               AND payload->>'council_id' = $1`,
            [council_id]
          );

          if (existingCouncil.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Совет ${council_id} уже существует` });
          }
        }

        // Выбираем родительские акты для ro.DAG
        const parentRefs = await selectParentRefs(actor_ok, 3);

        // Записываем управленческий акт
        const result = await client.query(
          `INSERT INTO acts_log (act_type, actor_ok, target_ok, payload, refs)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING act_id, created_at`,
          [act_type, actor_ok, target_ok || null, payload, parentRefs]
        );

        await client.query('COMMIT');

        res.json({
          success: true,
          act_id: result.rows[0].act_id,
          created_at: result.rows[0].created_at
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // --- Другие типы актов (пока заглушка) ---
    else {
      const result = await pool.query(
        `INSERT INTO acts_log (act_type, actor_ok, target_ok, payload)
         VALUES ($1, $2, $3, $4)
         RETURNING act_id, created_at`,
        [act_type, actor_ok, target_ok || null, payload]
      );

      res.json({
        success: true,
        act_id: result.rows[0].act_id,
        created_at: result.rows[0].created_at
      });
    }

  } catch (err) {
    console.error('[ACT INSERT ERROR]', err.message);
    res.status(500).json({ error: 'Failed to record act' });
  }
});

// --------------------------------------------------
// ::про.3:: — проекция присутствия (поток У.Е. в окне времени)
// --------------------------------------------------

app.get('/api/presence/:ok_id', async (req, res) => {
  const { ok_id } = req.params;
  let { window_start } = req.query;

  try {
    if (!isValidOK(ok_id)) {
      return res.status(400).json({ error: 'Invalid ok_id format' });
    }

    // Если window_start не указан, используем Metronome
    if (!window_start) {
      window_start = Metronome.getWindowStart();
    }

    // --- Проекция потока (не накопление, а отражение активности) ---
    const result = await pool.query(
      `
      SELECT
        act_type,
        actor_ok,
        target_ok,
        payload
      FROM acts_log
      WHERE (actor_ok = $1 OR target_ok = $1)
        AND act_type IN ('EMISSION', 'TRANSFER')
        AND created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    // Считаем поток на сервере (не в SQL)
    let ue_flow = 0;
    for (const act of result.rows) {
      if (act.act_type === 'EMISSION' && act.actor_ok === ok_id) {
        // Эмиссия: считаем количество У.Е. из триад
        const triads = act.payload.triads || [];
        triads.forEach(triad => {
          ue_flow += TRIADS[triad] ? TRIADS[triad].ueCount : 0;
        });
      } else if (act.act_type === 'TRANSFER' && act.actor_ok === ok_id) {
        // Передача от меня: -1
        ue_flow -= 1;
      } else if (act.act_type === 'TRANSFER' && act.target_ok === ok_id) {
        // Передача мне: +1
        ue_flow += 1;
      }
    }

    res.json({
      ok_id,
      projection: {
        ue_flow,
        window_start
      }
    });

  } catch (err) {
    console.error('[PRESENCE ERROR]', err.message);
    res.status(500).json({ error: 'Failed to compute presence projection' });
  }
});

// --------------------------------------------------
// Сгорание У.Е. (Burn Event) — выдох системы
// --------------------------------------------------

app.post('/api/burn', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const nowISO = Metronome.getCurrentTimeISO();

    // Найти все У.Е., которые должны сгореть
    const toBurnResult = await client.query(
      `
      SELECT ue_uuid, ue_number, triad, actor_ok, burn_at, emission_act_id
      FROM ue_units
      WHERE status IN ('active', 'impulse')
        AND burn_at <= $1::timestamp
      `,
      [nowISO]
    );

    const burnedUEs = [];

    for (const ue of toBurnResult.rows) {
      // Создать акт BURNED в acts_log с refs на акт эмиссии
      const actResult = await client.query(
        `
        INSERT INTO acts_log (act_type, actor_ok, payload, refs)
        VALUES ($1, $2, $3, $4)
        RETURNING act_id, created_at
        `,
        [
          'BURNED',
          ue.actor_ok,
          {
            ue_uuid: ue.ue_uuid,
            ue_number: ue.ue_number,
            triad: ue.triad,
            burn_at: ue.burn_at
          },
          [ue.emission_act_id]  // refs на акт эмиссии
        ]
      );

      // Обновить статус У.Е.
      await client.query(
        `
        UPDATE ue_units
        SET status = 'burned',
            transferred_at = $1
        WHERE ue_uuid = $2
        `,
        [actResult.rows[0].created_at, ue.ue_uuid]
      );

      burnedUEs.push({
        ue_uuid: ue.ue_uuid,
        ue_number: ue.ue_number,
        triad: ue.triad,
        actor_ok: ue.actor_ok,
        act_id: actResult.rows[0].act_id
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      burned_count: burnedUEs.length,
      burned_ues: burnedUEs,
      timestamp: nowISO
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[BURN ERROR]', err.message);
    res.status(500).json({ error: 'Failed to burn UE units' });
  } finally {
    client.release();
  }
});

// --------------------------------------------------
// Зеркало присутствия — проекция О.К.
// --------------------------------------------------

app.get('/api/mirror/:ok_id', async (req, res) => {
  const { ok_id } = req.params;
  let { window_start } = req.query;

  try {
    if (!isValidOK(ok_id)) {
      return res.status(400).json({ error: 'Invalid ok_id format' });
    }

    // Используем Metronome для границы окна
    if (!window_start) {
      window_start = Metronome.getWindowStart();
    }

    // Проверка на Абсолютный ноль (::0::)
    // Условие: О.К. без актов ИЛИ нет передач У.Е./У.М. в течение 90 дней
    const hasActsResult = await pool.query(
      `SELECT COUNT(*) as count FROM acts_log WHERE actor_ok = $1`,
      [ok_id]
    );

    const hasActs = parseInt(hasActsResult.rows[0].count) > 0;

    // Если нет актов вообще — сразу ::0::
    if (!hasActs) {
      return res.json({
        ok_id,
        state: 'absolute_zero',
        reason: 'no_acts',
        presence: { ue_flow: 0, window_start },
        trace: { last_act_at: null, silence_hours: null },
        burn: { last_burn_at: null, burned_recently: 0 },
        recognition: { recent_markers: [] },
        recognition_field: {
          has_witnesses: false,
          diversity: { personal: false, observation: false, indirect: false },
          triad_coverage: [],
          multi_source: false,
          cross_triad: false
        },
        graph: { recognition_links: 0, unique_witnesses: 0, density_hint: 'sparse' },
        directions: {
          given: { count: 0, direction: 'outward' },
          received: { count: 0, direction: 'inward' },
          burned: { count: 0, direction: 'release' }
        },
        field: { connections: 'sparse', activity: 'quiet' }
      });
    }

    // Проверка последней значимой активности (TRANSFER или RECOGNITION)
    const lastSignificantActivityResult = await pool.query(
      `
      SELECT MAX(created_at) as last_activity
      FROM (
        SELECT created_at FROM acts_log
        WHERE actor_ok = $1 AND act_type = 'TRANSFER'
        UNION ALL
        SELECT al.created_at FROM acts_annotations aa
        JOIN acts_log al ON aa.act_ref_id = al.act_id
        WHERE aa.author_ok = $1 AND aa.annotation_type = 'RECOGNITION'
      ) AS significant_acts
      `,
      [ok_id]
    );

    const last_activity = lastSignificantActivityResult.rows[0].last_activity;

    // Если есть последняя активность, проверяем 90 дней
    if (last_activity) {
      const inactivity_days = (Date.now() - new Date(last_activity).getTime()) / (1000 * 60 * 60 * 24);

      if (inactivity_days >= 90) {
        // Переход в ::0:: с сохранением истории
        return res.json({
          ok_id,
          state: 'absolute_zero',
          reason: 'inactivity_90_days',
          last_activity_at: last_activity,
          inactivity_days: parseFloat(inactivity_days.toFixed(1)),
          presence: { ue_flow: 0, window_start },
          trace: {
            last_act_at: last_activity,
            silence_hours: parseFloat((inactivity_days * 24).toFixed(1))
          },
          burn: { last_burn_at: null, burned_recently: 0 },
          recognition: { recent_markers: [] },
          recognition_field: {
            has_witnesses: false,
            diversity: { personal: false, observation: false, indirect: false },
            triad_coverage: [],
            multi_source: false,
            cross_triad: false
          },
          graph: { recognition_links: 0, unique_witnesses: 0, density_hint: 'sparse' },
          directions: {
            given: { count: 0, direction: 'outward' },
            received: { count: 0, direction: 'inward' },
            burned: { count: 0, direction: 'release' }
          },
          field: { connections: 'sparse', activity: 'quiet' }
        });
      }
    }

    // 1. Присутствие (::про.3.::) — поток У.Е. в окне
    // Источник истины: только acts_log
    const presenceResult = await pool.query(
      `
      SELECT
        act_type,
        actor_ok,
        target_ok,
        payload
      FROM acts_log
      WHERE (actor_ok = $1 OR target_ok = $1)
        AND act_type IN ('EMISSION', 'TRANSFER')
        AND created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    // Считаем поток на сервере (не в SQL)
    let ue_flow = 0;
    for (const act of presenceResult.rows) {
      if (act.act_type === 'EMISSION' && act.actor_ok === ok_id) {
        // Эмиссия: считаем количество У.Е. из триад
        const triads = act.payload.triads || [];
        triads.forEach(triad => {
          ue_flow += TRIADS[triad] ? TRIADS[triad].ueCount : 0;
        });
      } else if (act.act_type === 'TRANSFER' && act.actor_ok === ok_id) {
        // Передача от меня: -1
        ue_flow -= 1;
      } else if (act.act_type === 'TRANSFER' && act.target_ok === ok_id) {
        // Передача мне: +1
        ue_flow += 1;
      }
    }

    // 2. След — последний акт и тишина
    const traceResult = await pool.query(
      `
      SELECT MAX(created_at) AS last_act_at
      FROM acts_log
      WHERE actor_ok = $1 OR target_ok = $1
      `,
      [ok_id]
    );

    const last_act_at = traceResult.rows[0].last_act_at;
    const silence_hours = last_act_at
      ? Metronome.calculateSilence(last_act_at)
      : null;

    // 2.1. Выдох — последнее сгорание
    const burnResult = await pool.query(
      `
      SELECT
        MAX(created_at) AS last_burn_at,
        COUNT(*) AS burned_recently
      FROM acts_log
      WHERE actor_ok = $1
        AND act_type = 'BURNED'
        AND created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    const last_burn_at = burnResult.rows[0].last_burn_at;
    const burned_recently = parseInt(burnResult.rows[0].burned_recently);

    // 3. Признание (::про.4.::) — У.М. от других
    const recognitionResult = await pool.query(
      `
      SELECT
        aa.payload->>'marker_type' AS marker_type,
        aa.payload->>'marker_text' AS marker_text,
        aa.payload->>'witness_scope' AS witness_scope,
        aa.payload->>'triad_link' AS triad_link,
        aa.payload->>'intensity' AS intensity,
        aa.author_ok,
        aa.created_at
      FROM acts_annotations aa
      JOIN acts_log al ON aa.act_ref_id = al.act_id
      WHERE (al.actor_ok = $1 OR al.target_ok = $1)
        AND aa.annotation_type = 'RECOGNITION'
        AND aa.author_ok != $1
        AND aa.created_at >= $2::timestamp
      ORDER BY aa.created_at DESC
      LIMIT 10
      `,
      [ok_id, window_start]
    );

    const recent_markers = recognitionResult.rows.map(row => ({
      type: row.marker_type,
      text: row.marker_text,
      witness_scope: row.witness_scope,
      triad_link: row.triad_link,
      intensity: row.intensity ? parseInt(row.intensity) : null,
      from: row.author_ok,
      at: row.created_at
    }));

    // 4. Направления (::про.4.ВЕС::) — векторы, не скаляр
    const directionsResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE act_type = 'EMISSION' AND actor_ok = $1) AS emissions,
        COUNT(*) FILTER (WHERE act_type = 'TRANSFER' AND actor_ok = $1) AS transfers_out,
        COUNT(*) FILTER (WHERE act_type = 'TRANSFER' AND target_ok = $1) AS transfers_in,
        COUNT(*) FILTER (WHERE act_type = 'BURNED' AND actor_ok = $1) AS burned
      FROM acts_log
      WHERE (actor_ok = $1 OR target_ok = $1)
        AND created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    const dir = directionsResult.rows[0];
    const directions = {
      given: {
        count: parseInt(dir.emissions) + parseInt(dir.transfers_out),
        direction: 'outward'
      },
      received: {
        count: parseInt(dir.transfers_in),
        direction: 'inward'
      },
      burned: {
        count: parseInt(dir.burned),
        direction: 'release'
      }
    };

    // 5. Поле признания (recognition_field) — форма, не число
    const recognitionFieldResult = await pool.query(
      `
      SELECT
        COUNT(DISTINCT rde.edge_id) > 0 AS has_witnesses,
        COUNT(DISTINCT rde.meta->>'witness_scope') AS scope_diversity,
        ARRAY_AGG(DISTINCT rde.meta->>'witness_scope') FILTER (WHERE rde.meta->>'witness_scope' IS NOT NULL) AS scopes,
        ARRAY_AGG(DISTINCT rde.meta->>'triad_link') FILTER (WHERE rde.meta->>'triad_link' IS NOT NULL) AS triad_coverage
      FROM ro_dag_edges rde
      JOIN acts_log al ON rde.to_act_id = al.act_id
      WHERE al.actor_ok = $1
        AND rde.edge_type = 'RECOGNITION'
        AND rde.created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    const rf = recognitionFieldResult.rows[0];
    const recognition_field = {
      has_witnesses: rf.has_witnesses || false,
      diversity: {
        personal: (rf.scopes || []).includes('personal'),
        observation: (rf.scopes || []).includes('observation'),
        indirect: (rf.scopes || []).includes('indirect')
      },
      triad_coverage: rf.triad_coverage || [],
      multi_source: (rf.scope_diversity || 0) > 1,
      cross_triad: (rf.triad_coverage || []).length > 1
    };

    // 6. Граф (graph) — структура связей, не рейтинг
    const graphResult = await pool.query(
      `
      SELECT
        COUNT(DISTINCT rde.edge_id) AS recognition_links,
        COUNT(DISTINCT al_rec.actor_ok) AS unique_witnesses
      FROM ro_dag_edges rde
      JOIN acts_log al ON rde.to_act_id = al.act_id
      JOIN acts_log al_rec ON rde.from_act_id = al_rec.act_id
      WHERE al.actor_ok = $1
        AND rde.edge_type = 'RECOGNITION'
        AND rde.created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    const gr = graphResult.rows[0];
    const recognition_links = parseInt(gr.recognition_links) || 0;
    const unique_witnesses = parseInt(gr.unique_witnesses) || 0;

    // Density hint — состояние структуры, не рейтинг
    let density_hint = 'sparse';
    if (recognition_links >= 20) {
      density_hint = 'dense';
    } else if (recognition_links >= 6) {
      density_hint = 'forming';
    }

    const graph = {
      recognition_links,
      unique_witnesses,
      density_hint
    };

    // 7. Поле (field) — насыщенность без чисел
    // connections: качество связности (sparse|woven|dense)
    // activity: качество активности (quiet|active|resonant)

    // Connections — на основе recognition_links + directions
    let connections = 'sparse';
    const total_connections = recognition_links + directions.given.count + directions.received.count;
    if (total_connections >= 30) {
      connections = 'dense';
    } else if (total_connections >= 10) {
      connections = 'woven';
    }

    // Activity — на основе silence_hours + recent activity
    let activity = 'quiet';
    const recent_acts_count = directions.given.count + directions.received.count;

    if (silence_hours !== null && silence_hours < 24 && recent_acts_count >= 5) {
      activity = 'resonant';
    } else if (silence_hours !== null && silence_hours < 72 && recent_acts_count >= 2) {
      activity = 'active';
    }

    const field = {
      connections,
      activity
    };

    // 8. Статус ro.DAG (две галочки) — положение в Древе Инициаторов
    // received_um: получил маркер доверия (У.М.) от другого участника
    // sent_ue: внёс вклад в ветвление (передал У.Е.)

    const roDagStatusResult = await pool.query(
      `
      SELECT
        EXISTS(
          SELECT 1 FROM acts_annotations aa
          JOIN acts_log al ON aa.act_ref_id = al.act_id
          WHERE (al.actor_ok = $1 OR al.target_ok = $1)
            AND aa.annotation_type = 'RECOGNITION'
            AND aa.author_ok != $1
        ) AS received_um,
        EXISTS(
          SELECT 1 FROM acts_log
          WHERE actor_ok = $1 AND act_type = 'TRANSFER'
        ) AS sent_ue
      `,
      [ok_id]
    );

    const ro_dag_status = {
      received_um: roDagStatusResult.rows[0].received_um || false,
      sent_ue: roDagStatusResult.rows[0].sent_ue || false,
      in_tree: (roDagStatusResult.rows[0].received_um || false) && (roDagStatusResult.rows[0].sent_ue || false)
    };

    // Зеркало присутствия
    // Определить фазу цикла присутствия
    const mirrorData = {
      trace: {
        last_act_at,
        silence_hours: silence_hours !== null ? parseFloat(silence_hours.toFixed(1)) : null
      },
      ro_dag_status,
      ue_flow,
      directions,
      burn: {
        last_burn_at,
        burned_recently,
        burn_echo: null // будет заполнено ниже, если нужно
      }
    };

    const cycle = await determineCyclePhase(ok_id, mirrorData);

    res.json({
      ok_id,
      presence: {
        ue_flow,
        window_start,
        ro_dag_status
      },
      trace: {
        last_act_at,
        silence_hours: silence_hours !== null ? parseFloat(silence_hours.toFixed(1)) : null
      },
      burn: {
        last_burn_at,
        burned_recently
      },
      recognition: {
        recent_markers
      },
      recognition_field,
      graph,
      directions,
      field,
      cycle
    });

  } catch (err) {
    console.error('[MIRROR ERROR]', err.message);
    res.status(500).json({ error: 'Failed to compute mirror projection' });
  }
});

// --------------------------------------------------
// ::про.4:: — интерпретации (УЗОР) + У.М.
// --------------------------------------------------

app.post('/api/annotations', async (req, res) => {
  const { act_ref_id, author_ok, annotation_type, payload, value } = req.body;

  try {
    if (!act_ref_id) {
      return res.status(400).json({ error: 'act_ref_id required' });
    }

    if (!isValidOK(author_ok)) {
      return res.status(400).json({ error: 'Invalid author_ok' });
    }

    // --- Проверка пауз созревания для RECOGNITION ---
    if (annotation_type === 'RECOGNITION') {
      const cooldownCheck = await checkCooldown(author_ok, 'RECOGNITION');
      if (!cooldownCheck.allowed) {
        return res.status(429).json({
          error: 'Cooldown active',
          message: cooldownCheck.message,
          reason: cooldownCheck.reason,
          remaining_ms: cooldownCheck.remaining_ms
        });
      }
    }

    // --- Проверка роли Предстоятеля (::00::) ---
    const isPredstoyatel = author_ok === '::00::';

    // --- RECOGNITION: валидация У.М. ---
    if (annotation_type === 'RECOGNITION') {
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'RECOGNITION requires payload' });
      }

      const { marker_type, marker_text, witness_scope, triad_link, intensity } = payload;

      // Валидация marker_type
      const validMarkerTypes = ['value', 'gratitude', 'alignment', 'witness', 'support'];
      if (!marker_type || !validMarkerTypes.includes(marker_type)) {
        return res.status(400).json({
          error: `Invalid marker_type. Must be one of: ${validMarkerTypes.join(', ')}`
        });
      }

      // Валидация marker_text
      if (!marker_text || typeof marker_text !== 'string') {
        return res.status(400).json({ error: 'marker_text required (string)' });
      }

      // Проверка лимита У.М. на период
      // Расширенные лимиты для Предстоятеля: 16 У.М. в день (для управления отДелом ::О0::)
      const maxUMPerDay = isPredstoyatel ? 16 : 10;

      const window_start = Metronome.getWindowStart();
      const umCountResult = await pool.query(
        `
        SELECT COUNT(*) as um_count
        FROM acts_annotations
        WHERE author_ok = $1
          AND annotation_type = 'RECOGNITION'
          AND created_at >= $2::timestamp
        `,
        [author_ok, window_start]
      );

      const umThisPeriod = parseInt(umCountResult.rows[0].um_count) || 0;

      if (umThisPeriod >= maxUMPerDay) {
        return res.status(400).json({
          error: `Превышен лимит ${maxUMPerDay} У.М. на период. Уже создано: ${umThisPeriod}`
        });
      }

      if (marker_text.length > 280) {
        return res.status(400).json({ error: 'marker_text must be <= 280 characters' });
      }

      // Валидация witness_scope (обязательно)
      const validWitnessScopes = ['personal', 'observation', 'indirect'];
      if (!witness_scope || !validWitnessScopes.includes(witness_scope)) {
        return res.status(400).json({
          error: `witness_scope required. Must be one of: ${validWitnessScopes.join(', ')}`
        });
      }

      // Валидация triad_link (опционально)
      if (triad_link && !isValidTriad(triad_link)) {
        return res.status(400).json({ error: 'Invalid triad_link. Must be T1-T5' });
      }

      // Валидация intensity (опционально, устарело)
      if (intensity !== undefined) {
        if (typeof intensity !== 'number' || intensity < 1 || intensity > 3) {
          return res.status(400).json({ error: 'intensity must be 1, 2, or 3 (deprecated field)' });
        }
      }

      // Проверка: author_ok ≠ actor_ok акта (нельзя признавать себя)
      const actCheck = await pool.query(
        `SELECT actor_ok FROM acts_log WHERE act_id = $1`,
        [act_ref_id]
      );

      if (actCheck.rows.length === 0) {
        return res.status(404).json({ error: 'act_ref_id not found' });
      }

      const actor_ok = actCheck.rows[0].actor_ok;

      if (author_ok === actor_ok) {
        return res.status(400).json({
          error: 'Нельзя признавать самого себя (author_ok === actor_ok)'
        });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Создать акт RECOGNITION в acts_log (для ro.DAG)
        const recognitionActResult = await client.query(
          `
          INSERT INTO acts_log (act_type, actor_ok, target_ok, payload)
          VALUES ($1, $2, $3, $4)
          RETURNING act_id, created_at
          `,
          [
            'RECOGNITION',
            author_ok,
            actor_ok,
            {
              marker_type,
              marker_text,
              witness_scope,
              triad_link,
              act_ref_id
            }
          ]
        );

        const recognition_act_id = recognitionActResult.rows[0].act_id;
        const created_at = recognitionActResult.rows[0].created_at;

        // Вставка У.М. в acts_annotations
        const annotationResult = await client.query(
          `
          INSERT INTO acts_annotations (
            act_ref_id,
            author_ok,
            annotation_type,
            payload
          )
          VALUES ($1, $2, $3, $4)
          RETURNING annotation_id
          `,
          [act_ref_id, author_ok, annotation_type, payload]
        );

        const annotation_id = annotationResult.rows[0].annotation_id;

        // Создание ребра в ro_dag_edges (RECOGNITION)
        await client.query(
          `
          INSERT INTO ro_dag_edges (from_act_id, to_act_id, edge_type, meta)
          VALUES ($1, $2, $3, $4)
          `,
          [
            recognition_act_id,
            act_ref_id,
            'RECOGNITION',
            { witness_scope, triad_link, marker_type }
          ]
        );

        // Structured logging для мониторинга ro.DAG
        console.log(JSON.stringify({
          event: 'dag.recognition.created',
          author_ok,
          actor_ok,
          act_ref_id,
          recognition_act_id,
          witness_scope,
          triad_link,
          marker_type,
          timestamp: created_at,
          level: 'info'
        }));

        await client.query('COMMIT');

        // Обновить last_act для cooldown
        await updateLastAct(author_ok, 'RECOGNITION');

        res.json({
          success: true,
          annotation_id: annotation_id,
          recognition_act_id: recognition_act_id,
          created_at: created_at
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // --- Другие типы интерпретаций (VALUATION, DISPUTE, NOTE) ---
    else {
      const result = await pool.query(
        `
        INSERT INTO acts_annotations (
          act_ref_id,
          author_ok,
          annotation_type,
          value,
          payload
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING annotation_id, created_at
        `,
        [act_ref_id, author_ok, annotation_type, value || null, payload || {}]
      );

      res.json({
        success: true,
        annotation_id: result.rows[0].annotation_id
      });
    }

  } catch (err) {
    console.error('[ANNOTATION ERROR]', err.message);

    // Обработка ошибки уникальности
    if (err.code === '23505' && err.constraint === 'idx_unique_recognition') {
      return res.status(400).json({
        error: 'Вы уже оставили этот тип признания для данного акта'
      });
    }

    res.status(500).json({ error: 'Failed to add annotation' });
  }
});

// --------------------------------------------------
// Минимальная регистрация О.К.
// (не идентификация, а фиксация присутствия)
// --------------------------------------------------

app.post('/api/ok', async (req, res) => {
  const { ok_key, public_key } = req.body;

  try {
    if (!isValidOK(ok_key)) {
      return res.status(400).json({ error: 'Invalid ok_key format' });
    }

    await pool.query(
      `
      INSERT INTO ok_identity (ok_key, public_key)
      VALUES ($1, $2)
      ON CONFLICT (ok_key) DO NOTHING
      `,
      [ok_key, public_key || null]
    );

    res.json({ success: true });

  } catch (err) {
    console.error('[OK REGISTER ERROR]', err.message);
    res.status(500).json({ error: 'Failed to register OK' });
  }
});

// --------------------------------------------------
// ::про.14:: — Порог вхождения (Threshold)
// --------------------------------------------------
// Создаёт О.К. и фиксирует акт пересечения порога (THRESHOLD_CROSSED).
// Это не техническая регистрация, а осознанный выбор оставить след.

app.post('/api/threshold', async (req, res) => {
  const { ok_key, public_key } = req.body;

  const client = await pool.connect();

  try {
    if (!isValidOK(ok_key)) {
      return res.status(400).json({ error: 'Invalid ok_key format' });
    }

    await client.query('BEGIN');

    // 1. Проверить, существует ли О.К.
    const existingOK = await client.query(
      `SELECT ok_key FROM ok_identity WHERE ok_key = $1`,
      [ok_key]
    );

    if (existingOK.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'OK already exists',
        message: 'Этот О.К. уже существует. Выберите другое имя.'
      });
    }

    // 2. Создать О.К.
    await client.query(
      `
      INSERT INTO ok_identity (ok_key, public_key)
      VALUES ($1, $2)
      `,
      [ok_key, public_key || null]
    );

    // 3. Зафиксировать акт THRESHOLD_CROSSED
    const actResult = await client.query(
      `
      INSERT INTO acts_log (act_type, actor_ok, target_ok, payload, refs)
      VALUES ($1, $2, NULL, $3, $4)
      RETURNING act_id, created_at
      `,
      [
        'THRESHOLD_CROSSED',
        ok_key,
        JSON.stringify({
          event: 'threshold_crossed',
          timestamp: new Date().toISOString(),
          message: 'Порог пересечён. Присутствие зафиксировано.'
        }),
        []
      ]
    );

    await client.query('COMMIT');

    // Обновить last_act для cooldown (первый акт О.К.)
    await updateLastAct(ok_key, 'THRESHOLD_CROSSED');

    console.log(`[THRESHOLD] ${ok_key} crossed the threshold at ${actResult.rows[0].created_at}`);

    res.json({
      success: true,
      ok_key,
      act_id: actResult.rows[0].act_id,
      created_at: actResult.rows[0].created_at,
      message: 'Порог пересечён. Добро пожаловать.'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[THRESHOLD ERROR]', err.message);
    res.status(500).json({ error: 'Failed to cross threshold' });
  } finally {
    client.release();
  }
});

// --------------------------------------------------
// ::про.5:: — поле для визуализации (сырые данные)
// --------------------------------------------------

app.get('/api/field/:ok_id', async (req, res) => {
  const { ok_id } = req.params;

  try {
    if (!isValidOK(ok_id)) {
      return res.status(400).json({ error: 'Invalid ok_id format' });
    }

    const window_start = Metronome.getWindowStart();

    // 1. Узлы (nodes) — все О.К., связанные с данным О.К.
    const nodesResult = await pool.query(
      `
      SELECT DISTINCT ok_key
      FROM (
        SELECT actor_ok AS ok_key FROM acts_log
        WHERE (actor_ok = $1 OR target_ok = $1)
          AND created_at >= $2::timestamp
        UNION
        SELECT target_ok AS ok_key FROM acts_log
        WHERE (actor_ok = $1 OR target_ok = $1)
          AND target_ok IS NOT NULL
          AND created_at >= $2::timestamp
      ) AS all_oks
      `,
      [ok_id, window_start]
    );

    // Обогащаем узлы информацией о ro.DAG статусе
    const nodesWithStatus = [];
    for (const row of nodesResult.rows) {
      const node_ok = row.ok_key;

      // Проверяем ro.DAG статус для каждого узла
      const roDagStatusResult = await pool.query(
        `SELECT
          EXISTS(SELECT 1 FROM acts_annotations aa
            JOIN acts_log al ON aa.act_ref_id = al.act_id
            WHERE (al.actor_ok = $1 OR al.target_ok = $1)
              AND aa.annotation_type = 'RECOGNITION'
              AND aa.author_ok != $1
          ) AS received_um,
          EXISTS(SELECT 1 FROM acts_log
            WHERE actor_ok = $1 AND act_type = 'TRANSFER'
          ) AS sent_ue`,
        [node_ok]
      );

      const ro_dag_status = {
        received_um: roDagStatusResult.rows[0].received_um || false,
        sent_ue: roDagStatusResult.rows[0].sent_ue || false,
        in_tree: (roDagStatusResult.rows[0].received_um || false) && (roDagStatusResult.rows[0].sent_ue || false)
      };

      nodesWithStatus.push({
        ok_id: node_ok,
        ro_dag_status
      });
    }

    const nodes = nodesWithStatus;

    // 2. Рёбра (edges) — все связи через ro_dag_edges
    const edgesResult = await pool.query(
      `
      SELECT
        rde.edge_id,
        rde.edge_type,
        rde.meta,
        al_from.actor_ok AS from_ok,
        al_to.actor_ok AS to_ok,
        al_to.target_ok AS to_target_ok,
        rde.created_at
      FROM ro_dag_edges rde
      JOIN acts_log al_from ON rde.from_act_id = al_from.act_id
      JOIN acts_log al_to ON rde.to_act_id = al_to.act_id
      WHERE (al_from.actor_ok = $1 OR al_to.actor_ok = $1 OR al_to.target_ok = $1)
        AND rde.created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    const edges = edgesResult.rows.map(row => ({
      edge_id: row.edge_id,
      edge_type: row.edge_type,
      from_ok: row.from_ok,
      to_ok: row.to_target_ok || row.to_ok,
      meta: row.meta || {},
      created_at: row.created_at
    }));

    // 3. Акты (acts) — минимальная информация
    const actsResult = await pool.query(
      `
      SELECT
        act_id,
        act_type,
        actor_ok,
        target_ok,
        created_at
      FROM acts_log
      WHERE (actor_ok = $1 OR target_ok = $1)
        AND created_at >= $2::timestamp
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [ok_id, window_start]
    );

    const acts = actsResult.rows.map(row => ({
      act_id: row.act_id,
      act_type: row.act_type,
      actor_ok: row.actor_ok,
      target_ok: row.target_ok,
      created_at: row.created_at
    }));

    // 4. Маркеры (markers) — У.М. как часть поля
    const markersResult = await pool.query(
      `
      SELECT
        aa.annotation_id,
        aa.act_ref_id,
        aa.author_ok,
        aa.payload->>'marker_type' AS marker_type,
        aa.payload->>'marker_text' AS marker_text,
        aa.payload->>'witness_scope' AS witness_scope,
        aa.payload->>'triad_link' AS triad_link,
        aa.created_at,
        al.actor_ok AS act_actor_ok,
        al.target_ok AS act_target_ok
      FROM acts_annotations aa
      JOIN acts_log al ON aa.act_ref_id = al.act_id
      WHERE (al.actor_ok = $1 OR al.target_ok = $1)
        AND aa.annotation_type = 'RECOGNITION'
        AND aa.created_at >= $2::timestamp
      ORDER BY aa.created_at DESC
      LIMIT 50
      `,
      [ok_id, window_start]
    );

    const markers = markersResult.rows.map(row => ({
      annotation_id: row.annotation_id,
      act_ref_id: row.act_ref_id,
      author_ok: row.author_ok,
      marker_type: row.marker_type,
      marker_text: row.marker_text,
      witness_scope: row.witness_scope,
      triad_link: row.triad_link,
      act_actor_ok: row.act_actor_ok,
      act_target_ok: row.act_target_ok,
      created_at: row.created_at
    }));

    // 5. Directions — векторы (из /api/mirror)
    const directionsResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE act_type = 'EMISSION' AND actor_ok = $1) AS emissions,
        COUNT(*) FILTER (WHERE act_type = 'TRANSFER' AND actor_ok = $1) AS transfers_out,
        COUNT(*) FILTER (WHERE act_type = 'TRANSFER' AND target_ok = $1) AS transfers_in,
        COUNT(*) FILTER (WHERE act_type = 'BURNED' AND actor_ok = $1) AS burned
      FROM acts_log
      WHERE (actor_ok = $1 OR target_ok = $1)
        AND created_at >= $2::timestamp
      `,
      [ok_id, window_start]
    );

    const dir = directionsResult.rows[0];
    const directions = {
      given: {
        count: parseInt(dir.emissions) + parseInt(dir.transfers_out),
        direction: 'outward'
      },
      received: {
        count: parseInt(dir.transfers_in),
        direction: 'inward'
      },
      burned: {
        count: parseInt(dir.burned),
        direction: 'release'
      }
    };

    // 6. Field — насыщенность (из /api/mirror)
    const recognition_links = edges.filter(e => e.edge_type === 'RECOGNITION').length;
    const total_connections = recognition_links + directions.given.count + directions.received.count;

    let connections = 'sparse';
    if (total_connections >= 30) {
      connections = 'dense';
    } else if (total_connections >= 10) {
      connections = 'woven';
    }

    // Activity — на основе недавней активности
    const lastActResult = await pool.query(
      `
      SELECT created_at
      FROM acts_log
      WHERE actor_ok = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [ok_id]
    );

    let activity = 'quiet';
    if (lastActResult.rows.length > 0) {
      const last_act_at = lastActResult.rows[0].created_at;
      const silence_hours = (Date.now() - new Date(last_act_at).getTime()) / (1000 * 60 * 60);
      const recent_acts_count = directions.given.count + directions.received.count;

      if (silence_hours < 24 && recent_acts_count >= 5) {
        activity = 'resonant';
      } else if (silence_hours < 72 && recent_acts_count >= 2) {
        activity = 'active';
      }
    }

    const field = {
      connections,
      activity
    };

    // 7. Trace — двойная природа: ЛИЦО (временное движение) и ОБЛИК (устойчивая форма)

    // Проверка на Абсолютный ноль (::0::)
    // Условие: О.К. без актов ИЛИ нет передач У.Е./У.М. в течение 90 дней
    const hasActsResult = await pool.query(
      `SELECT COUNT(*) as count FROM acts_log WHERE actor_ok = $1`,
      [ok_id]
    );

    const hasActs = parseInt(hasActsResult.rows[0].count) > 0;

    // Если нет актов вообще — сразу ::0::
    if (!hasActs) {
      return res.json({
        version: '0.4.0-alpha',
        generated_at: new Date().toISOString(),
        ok_id,
        window_start,
        state: 'absolute_zero',
        reason: 'no_acts',
        nodes: [],
        edges: [],
        acts: [],
        markers: [],
        directions: {
          given: { count: 0, direction: 'outward' },
          received: { count: 0, direction: 'inward' },
          burned: { count: 0, direction: 'release' }
        },
        field: {
          connections: 'sparse',
          activity: 'quiet'
        },
        trace: {
          last_act_at: null,
          silence_hours: null,
          face_window: 'silent',
          form_hint: 'emerging',
          burn_echo: { active: false, phase: 'release' }
        }
      });
    }

    // Проверка последней значимой активности (TRANSFER или RECOGNITION)
    const lastSignificantActivityResult = await pool.query(
      `
      SELECT MAX(created_at) as last_activity
      FROM (
        SELECT created_at FROM acts_log
        WHERE actor_ok = $1 AND act_type = 'TRANSFER'
        UNION ALL
        SELECT al.created_at FROM acts_annotations aa
        JOIN acts_log al ON aa.act_ref_id = al.act_id
        WHERE aa.author_ok = $1 AND aa.annotation_type = 'RECOGNITION'
      ) AS significant_acts
      `,
      [ok_id]
    );

    const last_activity = lastSignificantActivityResult.rows[0].last_activity;

    // Если есть последняя активность, проверяем 90 дней
    if (last_activity) {
      const inactivity_days = (Date.now() - new Date(last_activity).getTime()) / (1000 * 60 * 60 * 24);

      if (inactivity_days >= 90) {
        // Переход в ::0:: с сохранением истории
        return res.json({
          version: '0.4.0-alpha',
          generated_at: new Date().toISOString(),
          ok_id,
          window_start,
          state: 'absolute_zero',
          reason: 'inactivity_90_days',
          last_activity_at: last_activity,
          inactivity_days: parseFloat(inactivity_days.toFixed(1)),
          nodes: [],
          edges: [],
          acts: [], // История сохранена в БД, но не отображается
          markers: [],
          directions: {
            given: { count: 0, direction: 'outward' },
            received: { count: 0, direction: 'inward' },
            burned: { count: 0, direction: 'release' }
          },
          field: {
            connections: 'sparse',
            activity: 'quiet'
          },
          trace: {
            last_act_at: last_activity,
            silence_hours: parseFloat((inactivity_days * 24).toFixed(1)),
            face_window: 'silent',
            form_hint: 'emerging',
            burn_echo: { active: false, phase: 'release' }
          }
        });
      }
    }

    const traceResult = await pool.query(
      `
      SELECT created_at
      FROM acts_log
      WHERE actor_ok = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [ok_id]
    );

    // Проверка последнего burn-акта для burn_echo
    const lastBurnResult = await pool.query(
      `
      SELECT created_at
      FROM acts_log
      WHERE act_type = 'BURNED'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      []
    );

    let burn_echo = {
      active: false,
      phase: 'release'
    };

    if (lastBurnResult.rows.length > 0) {
      const last_burn_at = lastBurnResult.rows[0].created_at;
      const burn_hours_ago = (Date.now() - new Date(last_burn_at).getTime()) / (1000 * 60 * 60);

      // Burn echo активен в течение 1 часа после сгорания
      if (burn_hours_ago <= 1) {
        burn_echo.active = true;
      }
    }

    // Вычисление persistence_hours для ОБЛИКА
    const firstEdgeResult = await pool.query(
      `
      SELECT created_at
      FROM ro_dag_edges rde
      JOIN acts_log al ON rde.from_act_id = al.act_id OR rde.to_act_id = al.act_id
      WHERE al.actor_ok = $1
      ORDER BY rde.created_at ASC
      LIMIT 1
      `,
      [ok_id]
    );

    let persistence_hours = null;
    if (firstEdgeResult.rows.length > 0) {
      const first_edge_at = firstEdgeResult.rows[0].created_at;
      persistence_hours = (Date.now() - new Date(first_edge_at).getTime()) / (1000 * 60 * 60);
      persistence_hours = parseFloat(persistence_hours.toFixed(1));
    }

    // Проверка устойчивости структуры ro.DAG для form_hint
    const dagStructureResult = await pool.query(
      `
      SELECT
        COUNT(DISTINCT rde.edge_id) FILTER (WHERE rde.edge_type IN ('RECOGNITION', 'FLOW')) as confirmed_edges,
        COUNT(DISTINCT CONCAT(al_from.actor_ok, '-', al_to.actor_ok)) as unique_connections,
        MIN(rde.created_at) as first_edge_at,
        MAX(rde.created_at) as last_edge_at
      FROM ro_dag_edges rde
      JOIN acts_log al_from ON rde.from_act_id = al_from.act_id
      JOIN acts_log al_to ON rde.to_act_id = al_to.act_id
      WHERE al_from.actor_ok = $1 OR al_to.actor_ok = $1
      `,
      [ok_id]
    );

    const dagStruct = dagStructureResult.rows[0];
    const confirmed_edges = parseInt(dagStruct.confirmed_edges) || 0;
    const unique_connections = parseInt(dagStruct.unique_connections) || 0;
    const first_edge_at = dagStruct.first_edge_at;
    const last_edge_at = dagStruct.last_edge_at;

    // Проверка повторяющихся связей (steady)
    const repeatingConnectionsResult = await pool.query(
      `
      SELECT COUNT(*) as repeating_count
      FROM (
        SELECT CONCAT(al_from.actor_ok, '-', al_to.actor_ok) as connection, COUNT(*) as cnt
        FROM ro_dag_edges rde
        JOIN acts_log al_from ON rde.from_act_id = al_from.act_id
        JOIN acts_log al_to ON rde.to_act_id = al_to.act_id
        WHERE (al_from.actor_ok = $1 OR al_to.actor_ok = $1)
          AND rde.edge_type IN ('RECOGNITION', 'FLOW')
        GROUP BY connection
        HAVING COUNT(*) > 1
      ) AS repeating
      `,
      [ok_id]
    );

    const repeating_count = parseInt(repeatingConnectionsResult.rows[0].repeating_count) || 0;

    // Проверка стабильности структуры (settled) — граф не менялся более 120 часов
    let structure_stable_hours = null;
    if (last_edge_at) {
      structure_stable_hours = (Date.now() - new Date(last_edge_at).getTime()) / (1000 * 60 * 60);
    }

    let trace = {
      last_act_at: null,
      silence_hours: null,
      face_window: 'silent',
      form_hint: 'emerging',
      burn_echo
    };

    if (traceResult.rows.length > 0) {
      const last_act_at = traceResult.rows[0].created_at;
      const silence_hours = (Date.now() - new Date(last_act_at).getTime()) / (1000 * 60 * 60);

      // ЛИЦО (face_window) — временное движение
      let face_window = 'silent';

      if (silence_hours < 4) {
        face_window = 'alive';
      } else if (silence_hours < 28) {
        face_window = 'cooling';
      }

      // ОБЛИК (form_hint) — устойчивая форма
      let form_hint = 'emerging';

      if (confirmed_edges >= 3 && repeating_count > 0) {
        form_hint = 'steady';
      }

      if (structure_stable_hours !== null && structure_stable_hours >= 120 && confirmed_edges >= 3) {
        form_hint = 'settled';
      }

      trace = {
        last_act_at,
        silence_hours: parseFloat(silence_hours.toFixed(1)),
        face_window,
        form_hint,
        burn_echo
      };
    }

    // Ответ
    res.json({
      version: '0.4.0-alpha',
      generated_at: new Date().toISOString(),
      ok_id,
      window_start,
      nodes,
      edges,
      acts,
      markers,
      directions,
      field,
      trace
    });

  } catch (err) {
    console.error('[FIELD ERROR]', err.message);
    res.status(500).json({ error: 'Failed to compute field data' });
  }
});

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Pygmalion API Gateway running on port ${PORT}`);
});

// --------------------------------------------------
// Автономный метроном сгорания (Cron Job)
// --------------------------------------------------

// Запускается каждый день в 00:00:00 (полночь по московскому времени UTC+3)
// Для теста: запуск в 00:45 МСК
cron.schedule('45 0 * * *', async () => {
  const startTime = Date.now();
  const nowISO = Metronome.getCurrentTimeISO();

  // Structured logging (JSON для мониторинга)
  console.log(JSON.stringify({
    event: 'metronome_start',
    timestamp: nowISO,
    phase: Metronome.getCurrentPhase(),
    level: 'info'
  }));

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Найти все У.Е., которые должны сгореть
      const toBurnResult = await client.query(
        `
        SELECT ue_uuid, ue_number, triad, actor_ok, burn_at, emission_act_id
        FROM ue_units
        WHERE status IN ('active', 'impulse', 'transferred')
          AND burn_at <= $1::timestamp
        `,
        [nowISO]
      );

      const candidatesCount = toBurnResult.rows.length;
      let burnedCount = 0;
      const burnedDetails = [];

      for (const ue of toBurnResult.rows) {
        // Создать акт BURNED в acts_log с refs на акт эмиссии
        const actResult = await client.query(
          `
          INSERT INTO acts_log (act_type, actor_ok, payload, refs)
          VALUES ($1, $2, $3, $4)
          RETURNING act_id, created_at
          `,
          [
            'BURNED',
            ue.actor_ok,
            {
              ue_uuid: ue.ue_uuid,
              ue_number: ue.ue_number,
              triad: ue.triad,
              burn_at: ue.burn_at
            },
            [ue.emission_act_id]  // refs на акт эмиссии
          ]
        );

        // Обновить статус У.Е.
        await client.query(
          `
          UPDATE ue_units
          SET status = 'burned',
              transferred_at = $1
          WHERE ue_uuid = $2
          `,
          [actResult.rows[0].created_at, ue.ue_uuid]
        );

        // Создать ребро RELEASE в ro.DAG (замыкание траектории)
        await client.query(
          `
          INSERT INTO ro_dag_edges (from_act_id, to_act_id, edge_type)
          VALUES ($1, $2, $3)
          `,
          [ue.emission_act_id, actResult.rows[0].act_id, 'RELEASE']
        );

        burnedCount++;
        burnedDetails.push({
          ue_uuid: ue.ue_uuid,
          triad: ue.triad,
          ue_number: ue.ue_number,
          actor_ok: ue.actor_ok,
          act_id: actResult.rows[0].act_id
        });
      }

      await client.query('COMMIT');

      const duration = Date.now() - startTime;

      // Success logging
      console.log(JSON.stringify({
        event: 'metronome_success',
        timestamp: nowISO,
        candidates: candidatesCount,
        burned: burnedCount,
        duration_ms: duration,
        level: 'info',
        details: burnedDetails.slice(0, 10) // первые 10 для краткости
      }));

    } catch (err) {
      await client.query('ROLLBACK');

      // Error logging
      console.error(JSON.stringify({
        event: 'metronome_burn_error',
        timestamp: nowISO,
        error: err.message,
        stack: err.stack,
        level: 'error'
      }));

      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    // Connection error logging
    console.error(JSON.stringify({
      event: 'metronome_connection_error',
      timestamp: nowISO,
      error: err.message,
      level: 'error'
    }));
  }
}, {
  timezone: "Europe/Moscow"  // Московское время (UTC+3) для теста
});