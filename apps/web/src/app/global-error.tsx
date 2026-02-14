"use client";

/**
 * Global error boundary for unrecoverable root layout errors.
 *
 * Must provide its own <html> and <body> since the root layout
 * is unavailable when this boundary catches.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-gray-100 antialiased">
        <div className="max-w-md rounded-xl border border-red-500/30 bg-gray-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-100">Application Error</h2>
          <p className="mb-6 text-sm text-gray-400">
            {error.message || "A critical error occurred. Please refresh the page."}
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
