import axios from 'axios';

// Base URL is inlined at build time from NEXT_PUBLIC_API_URL (see .env).
// Reference it statically so Next.js can inline it.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Donor endpoints live under /donor/*; everything else is admin/staff.
function isDonorEndpoint(url = '') {
  return url.startsWith('/donor/') || url.startsWith('donor/');
}

// Attach the right token for the target endpoint so an admin token never
// leaks onto donor endpoints and vice versa.
apiClient.interceptors.request.use((config) => {
  if (typeof window === 'undefined') return config;

  if (isDonorEndpoint(config.url)) {
    const donorToken = localStorage.getItem('donorToken');
    if (donorToken) config.headers['Authorization'] = `Bearer ${donorToken}`;
  } else {
    const adminToken = localStorage.getItem('token');
    if (adminToken) config.headers['x-auth-token'] = adminToken;
  }
  return config;
});

// On 401 (expired/invalid token), clear the relevant session and send the
// user to the correct login page. Skip login attempts so failed logins can
// surface their own error instead of triggering a redirect/reload.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isLoginAttempt = url.includes('/auth/login');

    if (status === 401 && !isLoginAttempt && typeof window !== 'undefined') {
      if (isDonorEndpoint(url)) {
        localStorage.removeItem('donorToken');
        if (window.location.pathname !== '/donor/login') {
          window.location.href = '/donor/login';
        }
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
