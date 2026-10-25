import { createContext } from 'react';
export const AuthContext = createContext(null);
export const dashboardPath = (role) => `/dashboard/${role}`;
