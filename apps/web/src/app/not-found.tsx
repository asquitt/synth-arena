import { Nav } from "../components/nav";

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="flex items-center justify-center px-6 py-32">
        <div className="text-center">
          <p className="text-6xl font-bold text-orange-500">404</p>
          <h1 className="mt-4 text-2xl font-semibold text-gray-100">Page not found</h1>
          <p className="mt-2 text-gray-400">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
