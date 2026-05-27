const express = require('express');
const { logInfo, logError } = require('../lib/logger');

const QUIET = process.env.NODE_ENV === 'test' && process.env.LOG_VERBOSE !== '1';

// Enhanced request/response logging middleware
const requestLogger = (req, res, next) => {
  if (QUIET) return next();

  const start = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  // Log incoming request
  logInfo(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method !== 'GET' ? req.body : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    user: req.user ? { id: req.user.id, nickname: req.user.nickname } : undefined,
  });

  // Override res.send to log responses
  res.send = function(body) {
    const duration = Date.now() - start;

    try {
      let responseData = body;
      if (typeof body === 'string') {
        try {
          responseData = JSON.parse(body);
        } catch (e) {
          responseData = body;
        }
      }

      logInfo(`${req.method} ${req.path} - ${res.statusCode}`, {
        method: req.method,
        path: req.path,
        durationMs: duration,
        status: res.statusCode,
        responseSize: typeof body === 'string' ? body.length : JSON.stringify(body).length,
        success: res.statusCode < 400,
        responsePreview: typeof responseData === 'object' && responseData ?
          Object.keys(responseData).reduce((preview, key) => {
            if (key === 'data' && Array.isArray(responseData[key])) {
              preview[key] = `Array(${responseData[key].length})`;
            } else if (typeof responseData[key] === 'object' && responseData[key] !== null) {
              preview[key] = `Object(${Object.keys(responseData[key]).length} keys)`;
            } else {
              preview[key] = responseData[key];
            }
            return preview;
          }, {}) : responseData,
      });

      // Log errors in detail — structured for Cloud Logging.
      if (res.statusCode >= 400) {
        logError(`Error Response ${req.method} ${req.path}`, {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          error: responseData,
          requestBody: req.body,
          user: req.user ? req.user.id : 'anonymous',
        });
      }
    } catch (error) {
      logError('Logging middleware (send) failed', { err: error.message, stack: error.stack });
    }

    return originalSend.call(this, body);
  };

  // Override res.json to log JSON responses
  res.json = function(obj) {
    const duration = Date.now() - start;

    try {
      logInfo(`${req.method} ${req.path} - ${res.statusCode} (JSON)`, {
        method: req.method,
        path: req.path,
        durationMs: duration,
        status: res.statusCode,
        success: res.statusCode < 400,
        responseKeys: obj && typeof obj === 'object' ? Object.keys(obj) : 'not-object',
        dataLength: obj && obj.data && Array.isArray(obj.data) ? obj.data.length : undefined,
      });

      // Log detailed error information — structured for Cloud Logging.
      if (res.statusCode >= 400) {
        logError(`JSON Error Response ${req.method} ${req.path}`, {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          error: obj,
          stack: obj && obj.stack ? obj.stack : undefined,
          requestBody: req.body,
          user: req.user ? req.user.id : 'anonymous',
        });
      }
    } catch (error) {
      logError('Logging middleware (json) failed', { err: error.message, stack: error.stack });
    }

    return originalJson.call(this, obj);
  };

  next();
};

// Global error handler with detailed structured logging.
const errorHandler = (err, req, res, next) => {
  logError(`Unhandled Error in ${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    errorMessage: err.message,
    code: err.code,
    status: err.status,
    responseData: err.responseData,
    stack: err.stack,
    requestBody: req.body,
    query: req.query,
    params: req.params,
    user: req.user ? { id: req.user.id, nickname: req.user.nickname } : undefined,
    headers: {
      'content-type': req.get('content-type'),
      'authorization': req.get('authorization') ? 'Bearer [REDACTED]' : undefined,
    },
  });

  // Send error response
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? {
      type: err.name,
      stack: err.stack
    } : undefined,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  requestLogger,
  errorHandler,
  asyncHandler
};