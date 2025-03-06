import axios from 'axios';

// Create axios instance
const instance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor for Telegram authentication
instance.interceptors.request.use((config) => {
  // Check if we're in Telegram WebApp
  if (window.Telegram?.WebApp) {
    // Add Telegram initData to headers
    const initData = window.Telegram.WebApp.initData;
    if (initData) {
      config.headers['X-Telegram-Init-Data'] = initData;
    }
  } else {
    // For development/testing - get from session storage
    const storedInitData = sessionStorage.getItem('telegramInitData');
    if (storedInitData) {
      config.headers['X-Telegram-Init-Data'] = storedInitData;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Add response interceptor for error handling
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle error responses
    if (error.response) {
      // The request was made and the server responded with an error status
      console.error('API Error:', error.response.status, error.response.data);
      
      // Handle 401 Unauthorized - could be invalid Telegram auth
      if (error.response.status === 401 && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(
          'Authentication failed. Please restart the app.'
        );
      }
      
      // Handle rate limiting
      if (error.response.status === 429 && window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(
          'Too many requests. Please try again later.'
        );
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
      
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(
          'Network error. Please check your connection and try again.'
        );
      }
    } else {
      // Something happened in setting up the request
      console.error('Request configuration error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default instance;