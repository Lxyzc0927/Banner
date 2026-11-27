'use strict';

/**
 * 统一错误码。与 docs/04-api.md 保持一致。
 * 业务错误（1xxx）默认 HTTP 200，前端只认信封里的 code；
 * 认证/权限/不存在等协议级错误使用对应 HTTP 状态码。
 */
const CODES = {
  OK: 0,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,

  AUTH_FAILED: 1001,
  ACTIVITY_NOT_OPEN: 1002,
  QUOTA_FULL: 1003,
  ALREADY_SIGNED_UP: 1004,
  ACTIVITY_OFFLINE: 1005,
  DUPLICATE_ACCOUNT: 1006,
  PROTECTED_ACCOUNT: 1007,
  USER_DISABLED: 1008,
  INVALID_STATE: 1009,
  PHONE_REQUIRED: 1010,
  PHONE_BOUND: 1011,
  CONCURRENT_UPDATE: 1012,
  EXPORT_EMPTY: 1013,
  AI_UNAVAILABLE: 1014,
};

class ApiError extends Error {
  constructor(code, message, httpStatus = 200, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const errors = {
  badRequest: (message = '参数错误', details = null) => new ApiError(CODES.BAD_REQUEST, message, 400, details),
  unauthorized: (message = '请先登录') => new ApiError(CODES.UNAUTHORIZED, message, 401),
  forbidden: (message = '无权限执行此操作') => new ApiError(CODES.FORBIDDEN, message, 403),
  notFound: (message = '资源不存在') => new ApiError(CODES.NOT_FOUND, message, 404),
  conflict: (message = '数据冲突') => new ApiError(CODES.CONFLICT, message, 409),
  internal: (message = '服务异常') => new ApiError(CODES.INTERNAL, message, 500),
  business: (code, message, details = null) => new ApiError(code, message, 200, details),
};

module.exports = { CODES, ApiError, errors };
