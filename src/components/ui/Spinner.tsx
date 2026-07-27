// The single source of truth for the loading spinner. Previously this same
// `animate-spin` div was hand-copied ~59 times across the app. `border-current`
// makes the ring follow the parent's `text-*` colour, so it works on both dark
// (petal-ink) and light buttons without per-site tweaks.
export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="載入中"
      className={`inline-block border-2 border-current border-t-transparent rounded-full animate-spin ${className}`}
    />
  );
}

export default Spinner;
