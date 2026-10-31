/**
 * A small ring that sits beside a pending label. Decorative: the label next
 * to it is what says the action is running, so it is hidden from assistive
 * tech, and it stops turning for anyone who asked for reduced motion.
 */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none ${className}`}
    />
  );
}
