import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/trading/check-exit/route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/trading/check-exit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/trading/check-exit', () => {
  it('returns HOLD for a flat 0DTE position early in the day', async () => {
    const now = Date.UTC(2026, 8, 15, 15, 0) // 11:00 AM ET
    const entryTime = Date.UTC(2026, 8, 15, 14, 45) // 10:45 AM ET
    const res = await POST(makeRequest({
      entryPrice: 0.784,
      currentMark: 0.784,
      peakMarkSinceEntry: 0.784,
      isZeroDTE: true,
      entryTime,
      now,
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.shouldExit).toBe(false)
    expect(json.data.action).toBe('HOLD')
  })

  it('returns TIME_STOP_CUT_LOSS for a 0DTE position underwater past 2:30 PM ET', async () => {
    const now = Date.UTC(2026, 8, 15, 18, 35) // 2:35 PM ET
    const entryTime = Date.UTC(2026, 8, 15, 15, 1) // 11:01 AM ET
    const res = await POST(makeRequest({
      entryPrice: 0.784,
      currentMark: 0.235,
      peakMarkSinceEntry: 0.784,
      isZeroDTE: true,
      entryTime,
      now,
    }))
    const json = await res.json()
    expect(json.data.shouldExit).toBe(true)
    expect(json.data.action).toBe('TIME_STOP_CUT_LOSS')
  })

  it('returns TRAILING_STOP when a position peaked 30%+ then retreated to breakeven', async () => {
    const now = Date.UTC(2026, 8, 15, 16, 0)
    const entryTime = Date.UTC(2026, 8, 15, 14, 45)
    const res = await POST(makeRequest({
      entryPrice: 4.85,
      currentMark: 4.85,
      peakMarkSinceEntry: 6.5,
      isZeroDTE: false,
      entryTime,
      now,
    }))
    const json = await res.json()
    expect(json.data.shouldExit).toBe(true)
    expect(json.data.action).toBe('TRAILING_STOP')
  })

  it('rejects a request missing required fields', async () => {
    const res = await POST(makeRequest({ entryPrice: 1.0 }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('rejects negative entry price', async () => {
    const res = await POST(makeRequest({
      entryPrice: -1.0,
      currentMark: 0.5,
      peakMarkSinceEntry: 0.5,
      isZeroDTE: true,
      entryTime: Date.now(),
      now: Date.now(),
    }))
    expect(res.status).toBe(400)
  })
})
