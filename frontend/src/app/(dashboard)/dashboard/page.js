'use client';

import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Welcome back, {user?.email}
        </p>
      </div>

      {/* Placeholder for Module 2 — project listing will go here */}
      <div className="mt-8 border border-dashed border-[var(--border-default)] rounded-lg p-12 flex items-center justify-center">
        <p className="text-sm text-[var(--text-tertiary)]">
          Projects will appear here.
        </p>
      </div>
    </div>
  );
}
