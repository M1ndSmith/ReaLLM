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
    <section className={`ui-card${className ? ` ${className}` : ""}`}>
      {title || subtitle || actions ? (
        <header className="ui-card-head">
          <div>
            {title ? <h2 className="ui-card-title">{title}</h2> : null}
            {subtitle ? <p className="ui-card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ui-card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="ui-card-body">{children}</div>
    </section>
  );
}
