/** Shown for a moment while a screen loads: the shape of the page, gently shimmering. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-2 h-9 w-56" />
      <div className="skeleton mb-6 h-4 w-72 max-w-full" />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton mb-3 h-40" />
      <div className="skeleton h-40" />
    </div>
  );
}
