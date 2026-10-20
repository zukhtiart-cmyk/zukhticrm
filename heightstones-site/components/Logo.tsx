// Three cut slabs, stacked off-register: the Height Stones mark.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="5" width="24" height="5" />
      <rect x="8" y="13.5" width="20" height="5" />
      <rect x="4" y="22" width="16" height="5" />
    </svg>
  );
}
