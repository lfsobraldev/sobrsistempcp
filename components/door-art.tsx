/** Ilustrações originais (SVG) para a identidade de fábrica de portas. Sem imagens externas. */

export function DoorMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Sobral" focusable="false">
      <rect width="32" height="32" rx="6" fill="currentColor" />
      <rect x="9" y="5" width="14" height="22" rx="1" fill="none" stroke="#fff" strokeWidth="1.8" />
      <rect x="11.5" y="8" width="9" height="7" rx=".5" fill="#fff" opacity=".9" />
      <rect x="11.5" y="17" width="9" height="7" rx=".5" fill="#fff" opacity=".55" />
      <circle cx="20.2" cy="16" r="1.1" fill="#fff" />
    </svg>
  );
}

/** Três modelos de porta em elevação: lisa, com almofadas e com visor. */
export function DoorElevation({ className = "" }: { className?: string }) {
  const leaf = "#ffffff", frame = "#2f5e45", line = "#9db8a6", soft = "#e6efe8", knob = "#2f5e45";
  const Door = ({ x, children }: { x: number; children: React.ReactNode }) => (
    <g transform={`translate(${x} 20)`}>
      <rect x="0" y="0" width="112" height="196" rx="2" fill={soft} stroke={frame} strokeWidth="3" />
      <rect x="10" y="10" width="92" height="186" fill={leaf} stroke={frame} strokeWidth="2" />
      {children}
      <rect x="82" y="104" width="14" height="4" rx="2" fill={knob} />
      <circle cx="80" cy="106" r="3.5" fill={knob} />
    </g>
  );
  return (
    <svg className={className} viewBox="0 0 420 236" role="img" aria-label="Modelos de portas: lisa, com almofadas e com visor" focusable="false">
      <line x1="0" y1="216" x2="420" y2="216" stroke={frame} strokeWidth="3" />
      <Door x={6}>
        {[44, 82, 120, 158].map((y) => <line key={y} x1="10" x2="102" y1={y} y2={y} stroke={line} strokeWidth="1.2" />)}
      </Door>
      <Door x={154}>
        <rect x="22" y="24" width="68" height="62" fill="none" stroke={line} strokeWidth="2" />
        <rect x="30" y="32" width="52" height="46" fill={soft} stroke={line} />
        <rect x="22" y="104" width="68" height="76" fill="none" stroke={line} strokeWidth="2" />
        <rect x="30" y="112" width="52" height="60" fill={soft} stroke={line} />
      </Door>
      <Door x={302}>
        <rect x="26" y="26" width="60" height="70" rx="1" fill="#cfe2d6" stroke={frame} strokeWidth="2" />
        <line x1="26" y1="61" x2="86" y2="61" stroke="#fff" strokeWidth="2" />
        <line x1="56" y1="26" x2="56" y2="96" stroke="#fff" strokeWidth="2" />
        <rect x="24" y="122" width="64" height="58" fill="none" stroke={line} strokeWidth="2" />
      </Door>
    </svg>
  );
}

/** Silhueta de galpão com telhado em dentes de serra. */
export function FactoryRoof({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 120V70l100-44v44l100-44v44l100-44v44l100-44v44l100-44v44l100-44v44l100-44v44l100-44v44l100-44v44l100-44v44l100-44v44V120z" fill="currentColor" />
      <rect x="140" y="82" width="52" height="38" fill="#fff" opacity=".35" />
      <rect x="520" y="82" width="52" height="38" fill="#fff" opacity=".35" />
      <rect x="900" y="82" width="52" height="38" fill="#fff" opacity=".35" />
    </svg>
  );
}

/** Carregamento: a folha da porta abre e fecha atrás de um fundo de luz. */
export function DoorLoader({ label = "Carregando", sub }: { label?: string; sub?: string }) {
  return (
    <div className="dl-wrap" role="status" aria-live="polite">
      <div className="dl-door" aria-hidden="true">
        <div className="dl-light" />
        <div className="dl-leaf"><span className="dl-p1" /><span className="dl-p2" /><i className="dl-knob" /></div>
      </div>
      <b className="dl-title">{label}</b>
      {sub && <span className="dl-sub">{sub}</span>}
      <span className="dl-bar" aria-hidden="true"><i /></span>
    </div>
  );
}
