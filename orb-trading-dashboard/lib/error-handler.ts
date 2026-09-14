import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class DataUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 502)
    this.name = 'DataUnavailableError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'ValidationError'
  }
}

export class InsufficientCapitalError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Insufficient capital: need $${required.toFixed(2)}, have $${available.toFixed(2)}`,
      403,
      { required, available }
    )
    this.name = 'InsufficientCapitalError'
  }
}

export class RiskLimitExceededError extends AppError {
  constructor(currentLossPct: number, limitPct: number) {
    super(
      `Daily loss limit exceeded: ${currentLossPct.toFixed(2)}% > ${limitPct.toFixed(2)}%`,
      403,
      { currentLossPct, limitPct }
    )
    this.name = 'RiskLimitExceededError'
  }
}

export class DuplicateTradeError extends AppError {
  constructor(symbol: string) {
    super(`Already traded ${symbol} today`, 409, { symbol })
    this.name = 'DuplicateTradeError'
  }
}

export class StrategyBlockedError extends AppError {
  constructor(reason: string) {
    super(`Strategy blocked: ${reason}`, 202, { reason })
    this.name = 'StrategyBlockedError'
  }
}

export function classifyError(error: unknown): AppError {
  // Already an AppError: return as-is
  if (error instanceof AppError) {
    return error
  }

  // Zod validation error: classify as ValidationError
  if (error instanceof ZodError) {
    const issues = (error as any).issues || []
    const messages = issues.map((issue: any) => {
      const path = issue.path?.join('.') || 'unknown'
      return `${path}: ${issue.message}`
    })
    return new ValidationError(messages.join('; ') || 'Validation failed')
  }

  // Generic Error: wrap as AppError
  if (error instanceof Error) {
    return new AppError(error.message, 500)
  }

  // Unknown: generic internal error
  return new AppError('Unknown error', 500)
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  error?: string
}

export function toApiResponse(error: AppError): ApiResponse {
  // Mask internal server errors (500+) to prevent information leakage
  const message = error.statusCode >= 500 ? 'Internal error' : error.message

  return {
    success: false,
    data: null,
    error: message,
  }
}

export function toSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  }
}

// Logging helper for errors with correlation ID
export function logError(error: AppError, correlationId: string): void {
  const timestamp = new Date().toISOString()
  const level = error.statusCode >= 500 ? 'ERROR' : 'WARN'
  const logEntry = {
    timestamp,
    correlationId,
    level,
    error: error.name,
    message: error.message,
    statusCode: error.statusCode,
    ...(error.context && { context: error.context }),
  }

  // In production, this would send to a logging service (e.g., Sentry, LogRocket)
  // For now, log to console in dev mode
  if (process.env.NODE_ENV === 'development') {
    console.error('[ERROR]', JSON.stringify(logEntry))
  }
}
