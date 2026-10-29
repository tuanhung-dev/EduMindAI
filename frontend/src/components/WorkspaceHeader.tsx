import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  icon?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

/** One consistent header for the EduMind learning workspace. */
export default function WorkspaceHeader({ eyebrow, title, description, icon = "✦", actions, children }: Props) {
  return (
    <header className="emw-page-head">
      <div className="emw-page-head-main">
        <span className="emw-page-emblem" aria-hidden="true">{icon}</span>
        <div className="emw-page-head-copy">
          <span className="emw-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          {children}
        </div>
      </div>
      {actions && <div className="emw-page-head-actions">{actions}</div>}
    </header>
  );
}
