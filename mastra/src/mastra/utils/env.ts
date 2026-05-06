/**
 * Reads a required environment variable. Throws synchronously at startup if
 * the variable is missing or whitespace-only, so misconfiguration fails fast
 * with a clear message instead of surfacing as a downstream API error.
 */
export function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        throw new Error(`Missing or empty env var: ${name}`);
    }

    return value;
}
