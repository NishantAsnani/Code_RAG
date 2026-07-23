'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/constants/routes';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function SignupPage() {
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate() {
    const newErrors = {};
    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Enter a valid email';
    }
    if (!form.password) {
      newErrors.password = 'Password is required';
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
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
      await signup(form.name, form.email, form.password);
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
          Create an account
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Get started with CodeRAG.
        </p>
      </div>

      {apiError && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20">
          <p className="text-[13px] text-[var(--danger)]">{apiError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="signup-name"
          label="Name"
          type="text"
          placeholder="Your name"
          value={form.name}
          onChange={handleChange('name')}
          error={errors.name}
          autoComplete="name"
        />

        <Input
          id="signup-email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange('email')}
          error={errors.email}
          autoComplete="email"
        />

        <Input
          id="signup-password"
          label="Password"
          type="password"
          placeholder="Min. 6 characters"
          value={form.password}
          onChange={handleChange('password')}
          error={errors.password}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
          className="mt-1"
        >
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        Already have an account?{' '}
        <Link
          href={ROUTES.LOGIN}
          className="text-[var(--accent)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
