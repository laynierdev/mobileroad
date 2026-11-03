"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mr-page">
      <div className="mr-card p-5 text-center" role="alert">
        <h1 className="h4">Something went wrong</h1>
        <p className="text-muted">The page hit an unexpected error. Your projects are stored in this browser and were not changed.</p>
        {error.digest && <p className="small text-muted">Reference: {error.digest}</p>}
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
