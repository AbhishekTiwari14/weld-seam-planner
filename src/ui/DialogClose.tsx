export function DialogClose({ label, onClose }: { label: string; onClose: () => void }) {
  return <button type="button" className="dialog-close" aria-label={label} onClick={onClose}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  </button>;
}
