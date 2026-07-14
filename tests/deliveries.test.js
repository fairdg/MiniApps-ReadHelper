import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  intervalMinutesFromPerDay,
  notificationsPerDayFromDelivery,
  avoidQuietHours,
  isQuietHours,
  nextScheduleBase,
} from '../server/repositories/deliveries.js'

describe('intervalMinutesFromPerDay / notificationsPerDayFromDelivery', () => {
  // Базовый случай: UI даёт "уведомлений в день", доставка работает с
  // интервалом в минутах только внутри окна 08:00-23:00: 15 часов / 4 = 225.
  test('4 notifications/day -> 225 minute interval inside the delivery window', () => {
    assert.equal(intervalMinutesFromPerDay(4), 225)
  })

  test('clamps above MAX_PER_DAY (14)', () => {
    // Клампится к 14 и распределяется по бодрствующему окну 15 часов.
    assert.equal(intervalMinutesFromPerDay(24), Math.round(900 / 14))
  })

  test('clamps below MIN_PER_DAY (1) for a truthy-but-too-low value', () => {
    // Отрицательное число truthy, минует `|| fallback` и доходит до клампа —
    // в отличие от 0, которое JS считает falsy (см. следующий тест).
    assert.equal(intervalMinutesFromPerDay(-5), 900)
  })

  test('0 is falsy in JS, so it triggers the fallback rather than clamping to MIN_PER_DAY', () => {
    assert.equal(intervalMinutesFromPerDay(0, 4), 225)
  })

  test('falls back to fallbackPerDay for non-numeric input', () => {
    assert.equal(intervalMinutesFromPerDay(undefined, 4), 225)
  })

  test('reads the new notifications_per_day field as-is', () => {
    assert.equal(notificationsPerDayFromDelivery({ notifications_per_day: 6, interval_minutes: 999 }), 6)
  })

  test('keeps legacy 24-hour intervals readable for old rows', () => {
    assert.equal(
      notificationsPerDayFromDelivery({ notifications_per_day: null, interval_minutes: Math.round(1440 / 14) }),
      14,
    )
    assert.equal(
      notificationsPerDayFromDelivery({ notifications_per_day: null, interval_minutes: Math.round(1440 / 4) }),
      4,
    )
  })

  test('defaults to 4 when delivery settings are missing', () => {
    assert.equal(notificationsPerDayFromDelivery(null), 4)
    assert.equal(notificationsPerDayFromDelivery({ notifications_per_day: null, interval_minutes: 0 }), 4)
  })
})

describe('avoidQuietHours', () => {
  test('leaves a daytime send time untouched', () => {
    // 14:00 UTC — точно не тихие часы (23:00-08:00).
    const date = new Date('2026-01-15T14:00:00Z')
    const result = avoidQuietHours(date, 'UTC')
    assert.equal(result.getTime(), date.getTime())
  })

  test('pushes a late-night send to 08:00 the same/next day, same timezone', () => {
    // 02:00 UTC — внутри тихих часов (23:00-08:00).
    const date = new Date('2026-01-15T02:00:00Z')
    const result = avoidQuietHours(date, 'UTC')
    assert.equal(result.getUTCHours(), 8)
    assert.equal(result.getUTCMinutes(), 0)
    assert.equal(result.getUTCDate(), 15)
  })

  test('pushes a just-after-midnight send forward, not backward', () => {
    const date = new Date('2026-01-15T23:30:00Z')
    const result = avoidQuietHours(date, 'UTC')
    assert.ok(result.getTime() > date.getTime(), 'должно перенести вперёд, не назад')
    assert.equal(result.getUTCHours(), 8)
  })

  test('respects a non-UTC timezone (Asia/Tomsk, UTC+7)', () => {
    // 01:00 UTC = 08:00 в Томске — на самой границе, тихие часы уже кончились.
    const date = new Date('2026-01-15T01:00:00Z')
    const result = avoidQuietHours(date, 'Asia/Tomsk')
    assert.equal(result.getTime(), date.getTime(), 'граница 08:00 не должна считаться тихим часом')
  })

  test('shifts inside quiet hours for a non-UTC timezone', () => {
    // 20:00 UTC = 03:00 в Томске (UTC+7) — внутри тихих часов там.
    const date = new Date('2026-01-15T20:00:00Z')
    const result = avoidQuietHours(date, 'Asia/Tomsk')
    assert.notEqual(result.getTime(), date.getTime())
  })

  test('treats 23:00 exactly as the start of quiet hours', () => {
    assert.equal(isQuietHours(new Date('2026-01-15T23:00:00Z'), 'UTC'), true)
  })

  test('treats 08:00 exactly as the end of quiet hours', () => {
    assert.equal(isQuietHours(new Date('2026-01-15T08:00:00Z'), 'UTC'), false)
  })

  // Пользователь, который ни разу не открывал мини-аппу в браузере (только
  // писал боту), может не иметь сохранённой таймзоны — не должно падать,
  // должно вести себя как UTC.
  test('falls back to UTC when timezone is null (no saved timezone)', () => {
    const date = new Date('2026-01-15T02:00:00Z')
    const withNull = avoidQuietHours(date, null)
    const withUtc = avoidQuietHours(date, 'UTC')
    assert.equal(withNull.getTime(), withUtc.getTime())
  })
})

describe('nextScheduleBase', () => {
  test('keeps the previous planned slot when cron is only a bit late', () => {
    const scheduledAt = new Date('2026-01-15T10:00:00Z')
    const now = new Date('2026-01-15T10:12:00Z')
    const base = nextScheduleBase({ scheduledAt, intervalMinutes: 64, now })
    assert.equal(base.getTime(), scheduledAt.getTime())
  })

  test('resets to now when the job missed more than a full interval', () => {
    const scheduledAt = new Date('2026-01-15T10:00:00Z')
    const now = new Date('2026-01-15T12:30:00Z')
    const base = nextScheduleBase({ scheduledAt, intervalMinutes: 64, now })
    assert.equal(base.getTime(), now.getTime())
  })
})
