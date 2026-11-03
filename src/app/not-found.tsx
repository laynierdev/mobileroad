import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mr-page">
      <div className="mr-card p-5 text-center">
        <h1 className="h4">Page not found</h1>
        <p className="text-muted">That address does not exist in MobileRoad.</p>
        <Link href="/" className="btn btn-primary">Back to the roadmap</Link>
      </div>
    </div>
  );
}
