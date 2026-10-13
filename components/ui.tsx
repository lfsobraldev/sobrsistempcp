"use client";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type PanelProps = { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string };
export function Panel({ title, subtitle, actions, children, className = "" }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header>
          <div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "" }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "" | "warn" | "danger" | "success" }) {
  return (
    <div className={`kpi ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Empty({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{sub && <span>{sub}</span>}</div>;
}

export function Modal({ open, title, children, onClose, footer }: { open: boolean; title: ReactNode; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <header><h3>{title}</h3><button onClick={onClose} aria-label="Fechar"><X /></button></header>
        <div className="modalBody">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, title, children, onClose }: { open: boolean; title: ReactNode; children: ReactNode; onClose: () => void }) {
  return (
    <div className={`drawerWrap ${open ? "open" : ""}`}>
      <div className="drawerShade" onClick={onClose} />
      <aside className="drawer">
        <header><h3>{title}</h3><button onClick={onClose} aria-label="Fechar"><X /></button></header>
        <div>{children}</div>
      </aside>
    </div>
  );
}

export function Status({ value }: { value: unknown }) {
  const v = String(value ?? "");
  return <span className={`status s-${v.toLowerCase()}`}>{v.replaceAll("_", " ")}</span>;
}

/* ===== Primitivas de layout (design system v2) ===== */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ph">
      <div className="ph-text">
        {eyebrow && <span className="ph-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ icon, label, value, hint, tone = "neutral" }: { icon?: ReactNode; label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className={`stat stat-${tone}`}>
      {icon && <span className="stat-icon">{icon}</span>}
      <div>
        <span className="stat-label">{label}</span>
        <b className="stat-value">{value}</b>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Progress({ value, tone = "info", label }: { value: number; tone?: Tone; label?: ReactNode }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="progress">
      <div className="progress-track"><span className={`progress-fill progress-${tone}`} style={{ width: `${v}%` }} /></div>
      <b>{label ?? `${v.toFixed(0)}%`}</b>
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>{subtitle && <span className="card-eyebrow">{subtitle}</span>}{title && <h2>{title}</h2>}</div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function DataTable({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="tableScroll">
      <div className="tableWrap">
        <table>
          <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {empty}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
