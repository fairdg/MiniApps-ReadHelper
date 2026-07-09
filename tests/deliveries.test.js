import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  intervalMinutesFromPerDay,
  perDayFromIntervalMinutes,
  avoidQuietHours,
} from '../server/repositories/deliveries.js'

describe('intervalMinutesFromPerDay / perDayFromIntervalMinutes', () => {
  test('4 notifications/day -> 360 minute interval', () => {
    assert.equal(intervalMinutesFromPerDay(4), 360)
  })

  test('clamps above MAX_PER_DAY (14)', () => {
    // 24/день дало бы интервал 60 мин, но клампится к 14 -> 1440/14 ≈ 103 мин.
    assert.equal(intervalMinutesFromPerDay(24), Math.round(1440 / 14))
  })

  test('clamps below MIN_PER_DAY (1) for a truthy-but-too-low value', () => {
    // Отрицательное число truthy, минует `|| fallback` и доходит до клампа —
    // в отличие от 0, которое JS считает falsy (см. следующий тест).
    assert.equal(intervalMinutesFromPerDay(-5), 1440)
  })

  test('0 is falsy in JS, so it triggers the fallback rather than clamping to MIN_PER_DAY', () => {
    assert.equal(intervalMinutesFromPerDay(0, 4), 360)
  })

  test('falls back to fallbackPerDay for non-numeric input', () => {
    assert.equal(intervalMinutesFromPerDay(undefined, 4), 360)
  })

  test('round-trips through perDayFromIntervalMinutes', () => {
    const interval = intervalMinutesFromPerDay(6)
    assert.equal(perDayFromIntervalMinutes(interval), 6)
  })

  test('perDayFromIntervalMinutes defaults to 4 for falsy interval', () => {
    assert.equal(perDayFromIntervalMinutes(0), 4)
    assert.equal(perDayFromIntervalMinutes(null), 4)
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

  test('falls back to UTC when timezone is null (no saved timezone)', () => {
    const date = new Date('2026-01-15T02:00:00Z')
    const withNull = avoidQuietHours(date, null)
    const withUtc = avoidQuietHours(date, 'UTC')
    assert.equal(withNull.getTime(), withUtc.getTime())
  })
})
