/** The Curio globe-brain mark, tinted with the current foreground colour via CSS mask. */
export function Logo({ size = 28, label }: { size?: number; label?: string }) {
  return <span class="logo" style={{ width: `${size}px`, height: `${size}px` }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} />;
}
