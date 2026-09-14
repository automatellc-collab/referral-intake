import { NextRequest, NextResponse } from 'next/server'
import { ZodSchema } from 'zod'
import { ValidationError, classifyError, toApiResponse, toSuccessResponse, AppError } from './error-handler'

/**
 * Generate a unique correlation ID for request tracking and logging
 */
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Middleware to validate request body against a Zod schema
 * Returns 400 with validation errors if schema.parse fails
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: ZodSchema
): Promise<{ data: T; error: null } | { data: null; error: AppError }> {
  try {
    const body = await request.json()
    const parsed = schema.parse(body)
    return { data: parsed as T, error: null }
  } catch (err) {
    const error = classifyError(err)
    return { data: null, error }
  }
}

/**
 * Middleware to validate query parameters against a Zod schema
 */
export function validateQuery<T>(
  params: Record<string, string | string[] | undefined>,
  schema: ZodSchema
): { data: T; error: null } | { data: null; error: AppError } {
  try {
    const parsed = schema.parse(params)
    return { data: parsed as T, error: null }
  } catch (err) {
    const error = classifyError(err)
    return { data: null, error }
  }
}

/**
 * Standard API response handler: converts result or error to JSON response
 */
export function apiResponse<T>(
  statusCode: number,
  data?: T | null,
  error?: string
): NextResponse {
  const body = {
    success: statusCode < 400,
    data: data ?? null,
    ...(error && { error }),
  }
  return NextResponse.json(body, { status: statusCode })
}

/**
 * Error response handler: converts AppError to API response
 */
export function errorResponse(error: AppError): NextResponse {
  const response = toApiResponse(error)
  return apiResponse(error.statusCode, response.data, response.error)
}

/**
 * Success response handler
 */
export function successResponse<T>(data: T, statusCode: number = 200): NextResponse {
  const response = toSuccessResponse(data)
  return apiResponse(statusCode, response.data)
}

/**
 * Route handler wrapper that enforces validation, error handling, correlation IDs
 */
export type ApiHandler<TBody = unknown, TResponse = unknown> = (
  req: NextRequest,
  opts: { correlationId: string; body?: TBody }
) => Promise<NextResponse<{ success: boolean; data?: TResponse; error?: string }>>

export async function withValidation<TBody, TResponse>(
  schema: ZodSchema | null,
  handler: ApiHandler<TBody, TResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const correlationId = generateCorrelationId()

    try {
      // Validate body if schema provided
      let body: TBody | undefined
      if (schema) {
        const { data, error } = await validateBody(req, schema)
        if (error) {
          return errorResponse(error)
        }
        body = data
      }

      // Call handler with correlation ID and validated body
      return await handler(req, { correlationId, body })
    } catch (err) {
      const error = classifyError(err)
      return errorResponse(error)
    }
  }
}
