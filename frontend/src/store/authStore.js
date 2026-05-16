import { create } from 'zustand'

const TOKEN_KEY = 'hal_admin_token'
const USER_KEY = 'hal_admin_user'

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = create((set) => ({
  token: localStorage.getItem(TOKEN_KEY) ?? null,
  user: loadUser(),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),

  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ token, user: user ?? null, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null, isAuthenticated: false })
  },
}))
