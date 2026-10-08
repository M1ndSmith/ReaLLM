import type { ReactNode } from "react";

type Props = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Card({ title, subtitle, actions, children, className }: Props) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      {title || subtitle || actions ? (
        <header className="card-head">
          <div>
            {title ? <h2 className="card-title">{title}</h2> : null}
            {subtitle ? <p className="card-desc">{subtitle}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </header>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}
