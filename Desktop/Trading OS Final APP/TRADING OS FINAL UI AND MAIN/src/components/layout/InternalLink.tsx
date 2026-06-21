import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

type InternalLinkProps = PropsWithChildren<{
  href: string;
  className?: string;
}>;

export function InternalLink({ href, className, children }: InternalLinkProps) {
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}

