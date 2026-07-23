import Link from 'next/link';
import { ROUTES } from '@/constants/routes';

export default function Logo({ size = 'md' }) {
  const sizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  };

  return (
    <Link
      href={ROUTES.DASHBOARD}
      className={`font-mono font-semibold ${sizes[size]} text-[var(--text-primary)] tracking-tight hover:opacity-80 transition-opacity`}
    >
      <span className="text-[var(--accent)]">Code</span>
      <span>RAG</span>
    </Link>
  );
}
