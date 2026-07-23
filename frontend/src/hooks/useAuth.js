'use client';

import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import api from '@/services/api';
import { setCredentials, clearCredentials } from '@/store/slices/authSlice';
import { ROUTES } from '@/constants/routes';

export function useAuth() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useSelector((state) => state.auth);

  const login = useCallback(async (email, password) => {
    const response = await api.post('/user/login', { email, password });
    const { data } = response.data;
    dispatch(setCredentials({ token: data.token, email: data.email }));
    router.push(ROUTES.DASHBOARD);
    return response.data;
  }, [dispatch, router]);

  const signup = useCallback(async (name, email, password) => {
    const response = await api.post('/user/signup', { name, email, password });
    const { data } = response.data;
    dispatch(setCredentials({ token: data.token, email: data.email }));
    router.push(ROUTES.DASHBOARD);
    return response.data;
  }, [dispatch, router]);

  const logout = useCallback(() => {
    dispatch(clearCredentials());
    router.push(ROUTES.LOGIN);
  }, [dispatch, router]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    signup,
    logout,
  };
}
