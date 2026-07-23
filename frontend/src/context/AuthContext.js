'use client';

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { hydrate } from '@/store/slices/authSlice';

export default function AuthHydrator({ children }) {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(hydrate());
  }, [dispatch]);

  return children;
}
