//src/context/AuthContext.jsx
import { createContext, useEffect, useState, useCallback } from "react";
import { authApi } from "../services/api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await authApi.me();
      setUser(data);
    } catch {
      localStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Step 1: username + password.
  // Returns { otpRequired: true, challengeToken, maskedContact } for
  // Admin/Teacher/Finance, or { otpRequired: false, user } for everyone else.
  const login = async (username, password) => {
    const { data } = await authApi.login(username, password);
    if (data.otp_required) {
      return { otpRequired: true, challengeToken: data.challenge_token, maskedContact: data.masked_contact };
    }
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    setUser(data.user);
    return { otpRequired: false, user: data.user };
  };

  // Step 2: only called when login() returned otpRequired: true.
  const verifyOtp = async (challengeToken, otpCode) => {
    const { data } = await authApi.verifyOtp(challengeToken, otpCode);
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyOtp, logout, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}