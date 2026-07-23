'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/constants/routes';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate() {
    const newErrors = {};
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Enter a valid email';
    }
    if (!form.password) {
      newErrors.password = 'Password is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError('');

    if (!validate()) return;

    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      const message =
        err.response?.data?.message || 'Something went wrong. Please try again.';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(field) {
    return (e) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: '' }));
      }
      if (apiError) setApiError('');
    };
  }

  return (
    <div className="w-full animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Welcome back. Sign in to your account.
        </p>
      </div>

      {apiError && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20">
          <p className="text-[13px] text-[var(--danger)]">{apiError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="login-email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange('email')}
          error={errors.email}
          autoComplete="email"
        />

        <Input
          id="login-password"
          label="Password"
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={handleChange('password')}
          error={errors.password}
          autoComplete="current-password"
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
          className="mt-1"
        >
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        Don&apos;t have an account?{' '}
        <Link
          href={ROUTES.SIGNUP}
          className="text-[var(--accent)] hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
