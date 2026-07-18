import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  // Try to get admin token
  const adminToken = localStorage.getItem('token');
  if (adminToken) {
    config.headers['x-auth-token'] = adminToken;
  }
  // Try to get donor token (overrides admin if both exist? Better to prioritize donor for donor endpoints)
  const donorToken = localStorage.getItem('donorToken');
  if (donorToken) {
    config.headers['Authorization'] = `Bearer ${donorToken}`;
  }
  return config;
});

export default apiClient;