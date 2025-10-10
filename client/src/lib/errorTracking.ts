/**
 * Error Tracking Service
 * 
 * Centralized error tracking that can be easily connected to external services
 * like Sentry, LogRocket, or Bugsnag.
 * 
 * To integrate with an external service:
 * 1. Install the service SDK (e.g., @sentry/react)
 * 2. Initialize it in main.tsx
 * 3. Update the functions below to use the service's API
 */

interface ErrorContext {
  [key: string]: any;
}

class ErrorTracker {
  private isProduction = import.meta.env.PROD;

  /**
   * Track an error with optional context
   */
  captureError(error: Error | string, context?: ErrorContext): void {
    const errorMessage = error instanceof Error ? error.message : error;
    
    // In development, log to console
    if (!this.isProduction) {
      console.error('[Error]', errorMessage, context);
    }

    // TODO: Send to external error tracking service
    // Example for Sentry:
    // Sentry.captureException(error, { extra: context });
  }

  /**
   * Track a warning with optional context
   */
  captureWarning(message: string, context?: ErrorContext): void {
    // In development, log to console
    if (!this.isProduction) {
      console.warn('[Warning]', message, context);
    }

    // TODO: Send to external error tracking service
    // Example for Sentry:
    // Sentry.captureMessage(message, { level: 'warning', extra: context });
  }

  /**
   * Track general information (only in development)
   */
  captureInfo(message: string, context?: ErrorContext): void {
    if (!this.isProduction) {
      console.info('[Info]', message, context);
    }

    // Typically not sent to error tracking services
  }
}

export const errorTracker = new ErrorTracker();
