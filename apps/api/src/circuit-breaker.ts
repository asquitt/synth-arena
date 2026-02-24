/**
 * Lightweight circuit breaker for external service calls (Redis, DB, etc.).
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF_OPEN: After cooldown, one request allowed to test recovery
 *
 * Config: failureThreshold (default 5), cooldownMs (default 30s)
 */

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreakerOptions {
  /** Name for logging */
  name: string;
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Ms to wait before trying again after opening (default: 30000) */
  cooldownMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
  }

  /** Execute a function with circuit breaker protection. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = "half_open";
        console.log(JSON.stringify({
          level: "info",
          message: `Circuit breaker ${this.name}: half_open, testing recovery`,
        }));
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker ${this.name} is OPEN — failing fast`,
          this.name,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half_open") {
      console.log(JSON.stringify({
        level: "info",
        message: `Circuit breaker ${this.name}: recovered, closing circuit`,
      }));
    }
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      console.error(JSON.stringify({
        level: "error",
        message: `Circuit breaker ${this.name}: OPEN after ${this.failures} failures`,
        cooldownMs: this.cooldownMs,
      }));
    }
  }

  /** Get current circuit state for health checks. */
  getState(): { state: CircuitState; failures: number } {
    // Check if cooldown has expired for reporting
    if (this.state === "open" && Date.now() - this.lastFailureTime >= this.cooldownMs) {
      return { state: "half_open", failures: this.failures };
    }
    return { state: this.state, failures: this.failures };
  }

  /** Reset the circuit breaker to closed state. */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}
