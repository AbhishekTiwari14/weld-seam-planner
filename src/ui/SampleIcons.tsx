export function SampleIcon({ id }: { id: string }) {
  if (id === 't-joint') {
    return (
      <svg viewBox="0 0 80 60" className="sample-icon" aria-hidden="true">
        {/* Base plate */}
        <polygon points="10,36 40,20 70,36 40,52" fill="var(--brand-dark-forest-t2)" stroke="var(--brand-light-sand-s2)" strokeWidth="1.5" />
        <polygon points="10,36 10,42 40,58 40,52" fill="var(--brand-dark-forest-t1)" stroke="var(--brand-light-sand-s2)" strokeWidth="1.5" />
        <polygon points="40,52 40,58 70,42 70,36" fill="var(--brand-dark-forest)" stroke="var(--brand-light-sand-s2)" strokeWidth="1.5" />
        {/* Vertical web plate */}
        <polygon points="36,12 44,8 44,34 36,38" fill="var(--brand-dark-forest-t3)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
        <polygon points="44,8 48,10 48,36 44,34" fill="var(--brand-dark-forest-t2)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
        <polygon points="36,12 40,14 48,10 44,8" fill="var(--brand-dark-forest-t4)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
        {/* Weld seam highlights */}
        <line x1="36" y1="38" x2="22" y2="31" stroke="var(--brand-bright-discovery)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="48" y1="36" x2="62" y2="29" stroke="var(--brand-bright-discovery)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (id === 'gusset-bracket') {
    return (
      <svg viewBox="0 0 80 60" className="sample-icon" aria-hidden="true">
        {/* Backplate */}
        <polygon points="14,10 26,4 26,46 14,52" fill="var(--brand-dark-forest-t2)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
        <polygon points="26,4 32,7 32,49 26,46" fill="var(--brand-dark-forest-t3)" stroke="var(--brand-light-sand-s1)" strokeWidth="1.5" />
        {/* Bottom flange */}
        <polygon points="14,52 26,46 68,46 56,52" fill="var(--brand-dark-forest-t1)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
        <polygon points="56,52 68,46 68,51 56,57" fill="var(--brand-dark-forest)" stroke="var(--brand-light-sand-s2)" strokeWidth="1.5" />
        {/* Gusset triangle */}
        <polygon points="26,20 26,46 54,46" fill="var(--brand-dark-forest-t4)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
        {/* Fillet weld lines */}
        <line x1="26" y1="20" x2="26" y2="46" stroke="var(--brand-bright-discovery)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="26" y1="46" x2="54" y2="46" stroke="var(--brand-bright-discovery)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  // pipe-on-plate
  return (
    <svg viewBox="0 0 80 60" className="sample-icon" aria-hidden="true">
      {/* Plate */}
      <polygon points="10,38 40,22 70,38 40,54" fill="var(--brand-dark-forest-t2)" stroke="var(--brand-light-sand-s2)" strokeWidth="1.5" />
      <polygon points="10,38 10,43 40,59 40,54" fill="var(--brand-dark-forest-t1)" stroke="var(--brand-light-sand-s2)" strokeWidth="1.5" />
      <polygon points="40,54 40,59 70,43 70,38" fill="var(--brand-dark-forest)" stroke="var(--brand-light-sand-s2)" strokeWidth="1.5" />
      {/* Cylinder body */}
      <path d="M26,18 L26,38 A14,6 0 0,0 54,38 L54,18 Z" fill="var(--brand-dark-forest-t3)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
      {/* Cylinder top ellipse */}
      <ellipse cx="40" cy="18" rx="14" ry="6" fill="var(--brand-dark-forest-t4)" stroke="var(--brand-light-sand)" strokeWidth="1.5" />
      <ellipse cx="40" cy="18" rx="9" ry="3.8" fill="var(--brand-dark-forest)" stroke="var(--brand-light-sand-s2)" strokeWidth="1" />
      {/* Circumferential weld bead highlight */}
      <path d="M26,38 A14,6 0 0,0 54,38" fill="none" stroke="var(--brand-bright-discovery)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
