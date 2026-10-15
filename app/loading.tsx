export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-10 sm:px-6" role="status" aria-label="Loading">
      <div className="mb-8 h-8 w-48 rounded-lg bg-line" />
      <div className="grid gap-8 md:grid-cols-[300px_1fr]">
        <div className="h-64 rounded-2xl bg-line/70" />
        <div className="h-96 rounded-2xl bg-line/70" />
      </div>
    </div>
  );
}
