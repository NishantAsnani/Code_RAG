import { createSlice } from '@reduxjs/toolkit';
import { getToken, getStoredEmail, setToken, setStoredEmail, clearAuth } from '@/lib/token';

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    hydrate(state) {
      const token = getToken();
      const email = getStoredEmail();
      if (token && email) {
        state.user = { email };
        state.isAuthenticated = true;
      }
      state.isLoading = false;
    },
    setCredentials(state, action) {
      const { token, email } = action.payload;
      setToken(token);
      setStoredEmail(email);
      state.user = { email };
      state.isAuthenticated = true;
      state.isLoading = false;
    },
    clearCredentials(state) {
      clearAuth();
      state.user = null;
      state.isAuthenticated = false;
      state.isLoading = false;
    },
  },
});

export const { hydrate, setCredentials, clearCredentials } = authSlice.actions;
export default authSlice.reducer;
