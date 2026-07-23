import Logo from '@/components/ui/Logo';

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[var(--bg-primary)]">
      {/* Subtle dot pattern background */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--text-primary) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 w-full max-w-[380px] flex flex-col items-center">
        <div className="mb-8">
          <Logo size="lg" />
        </div>
        {children}
      </div>
    </div>
  );
}
