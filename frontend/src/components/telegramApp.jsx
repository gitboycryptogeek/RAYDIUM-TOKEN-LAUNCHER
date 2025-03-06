import React, { useState, useEffect, createContext, useContext } from 'react';
import WebApp from '@twa-dev/sdk';
import axios from 'axios';

// Create a Telegram context
const TelegramContext = createContext(null);

// Main Telegram Integration Component 
export const TelegramProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [theme, setTheme] = useState('light');
  const [walletInfo, setWalletInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize Telegram WebApp
  useEffect(() => {
    if (WebApp.isAvailable) {
      console.log('Initializing Telegram WebApp');
      
      // Tell Telegram that our app is ready
      WebApp.ready();
      WebApp.expand();
      
      // Set theme from Telegram
      setTheme(WebApp.colorScheme || 'light');
      
      // Get user data
      try {
        const initData = WebApp.initDataUnsafe || {};
        if (initData.user) {
          setUser({
            id: initData.user.id,
            firstName: initData.user.first_name,
            lastName: initData.user.last_name,
            username: initData.user.username,
            languageCode: initData.user.language_code
          });
          
          // Use the user data to get wallet info
          fetchWalletInfo(initData.user.id);
          
          // Store auth token for API calls
          sessionStorage.setItem('telegramInitData', WebApp.initData);
          axios.defaults.headers.common['X-Telegram-Init-Data'] = WebApp.initData;
        }
      } catch (error) {
        console.error('Error parsing Telegram user data:', error);
        setError('Failed to get user data from Telegram');
      }
      
      setInitialized(true);
      
      // Set up event listeners
      WebApp.onEvent('themeChanged', () => {
        setTheme(WebApp.colorScheme || 'light');
      });
    } else {
      console.log('Telegram WebApp not available, running in browser mode');
      // For development without Telegram
      setInitialized(true);
      setUser({ id: 'dev_user', username: 'dev_user', firstName: 'Dev' });
    }
  }, []);

  // Apply Telegram theme variables
  useEffect(() => {
    if (initialized) {
      // Apply theme colors to document root
      const root = document.documentElement;
      
      if (WebApp.isAvailable) {
        root.style.setProperty('--tg-theme-bg-color', WebApp.backgroundColor || (theme === 'dark' ? '#1f1f1f' : '#ffffff'));
        root.style.setProperty('--tg-theme-text-color', WebApp.textColor || (theme === 'dark' ? '#ffffff' : '#000000'));
        root.style.setProperty('--tg-theme-hint-color', WebApp.hintColor || (theme === 'dark' ? '#aaaaaa' : '#999999'));
        root.style.setProperty('--tg-theme-link-color', WebApp.linkColor || (theme === 'dark' ? '#8cc2f0' : '#2481cc'));
        root.style.setProperty('--tg-theme-button-color', WebApp.buttonColor || (theme === 'dark' ? '#8cc2f0' : '#2481cc'));
        root.style.setProperty('--tg-theme-button-text-color', WebApp.buttonTextColor || (theme === 'dark' ? '#000000' : '#ffffff'));
        root.style.setProperty('--tg-theme-secondary-bg-color', WebApp.secondaryBackgroundColor || (theme === 'dark' ? '#2c2c2c' : '#f0f0f0'));
      } else {
        // Default values for development
        const isDark = theme === 'dark';
        root.style.setProperty('--tg-theme-bg-color', isDark ? '#1f1f1f' : '#ffffff');
        root.style.setProperty('--tg-theme-text-color', isDark ? '#ffffff' : '#000000');
        root.style.setProperty('--tg-theme-hint-color', isDark ? '#aaaaaa' : '#999999');
        root.style.setProperty('--tg-theme-link-color', isDark ? '#8cc2f0' : '#2481cc');
        root.style.setProperty('--tg-theme-button-color', isDark ? '#8cc2f0' : '#2481cc');
        root.style.setProperty('--tg-theme-button-text-color', isDark ? '#000000' : '#ffffff');
        root.style.setProperty('--tg-theme-secondary-bg-color', isDark ? '#2c2c2c' : '#f0f0f0');
      }
      
      // Add theme class to body
      document.body.className = theme;
    }
  }, [theme, initialized]);

  // Fetch wallet info from backend
  const fetchWalletInfo = async (telegramId) => {
    if (!telegramId) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`/api/wallet/info?telegramId=${telegramId}`);
      setWalletInfo(response.data);
    } catch (error) {
      console.error('Error fetching wallet info:', error);
      setError('Failed to get wallet information');
    } finally {
      setLoading(false);
    }
  };

  // Create wallet for user
  const createWallet = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await axios.post('/api/wallet/create', {
        telegramId: user.id,
        telegramUsername: user.username
      });
      
      setWalletInfo(response.data);
      
      // Send data to Telegram Bot
      if (WebApp.isAvailable) {
        WebApp.sendData(JSON.stringify({
          type: 'wallet_created',
          publicKey: response.data.publicKey,
          balance: response.data.balance,
          network: response.data.cluster
        }));
      }
      
      return response.data;
    } catch (error) {
      console.error('Error creating wallet:', error);
      setError('Failed to create wallet');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Request airdrop
  const requestAirdrop = async () => {
    if (!walletInfo?.publicKey) return;
    
    setLoading(true);
    try {
      const response = await axios.post('/api/wallet/airdrop', {
        publicKey: walletInfo.publicKey,
        amount: 1
      });
      
      // Refresh wallet info
      await fetchWalletInfo(user.id);
      
      return response.data;
    } catch (error) {
      console.error('Error requesting airdrop:', error);
      setError('Failed to request airdrop');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Helper functions for Telegram interactions
  const telegramApi = {
    showAlert: (message) => {
      if (WebApp.isAvailable) {
        WebApp.showAlert(message);
      } else {
        alert(message);
      }
    },
    
    showConfirm: (message, callback) => {
      if (WebApp.isAvailable) {
        WebApp.showConfirm(message, callback);
      } else {
        const result = window.confirm(message);
        if (callback) callback(result);
      }
    },
    
    closeApp: () => {
      if (WebApp.isAvailable) {
        WebApp.close();
      }
    },
    
    mainButton: {
      show: (text = 'CONTINUE') => {
        if (WebApp.isAvailable) {
          WebApp.MainButton.setText(text);
          WebApp.MainButton.show();
        }
      },
      hide: () => {
        if (WebApp.isAvailable) {
          WebApp.MainButton.hide();
        }
      },
      onClick: (callback) => {
        if (WebApp.isAvailable) {
          WebApp.MainButton.onClick(callback);
        }
      }
    },
    
    sendData: (data) => {
      if (WebApp.isAvailable) {
        const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
        WebApp.sendData(jsonString);
      } else {
        console.log('SendData (dev mode):', data);
      }
    }
  };

  // Create the context value
  const context = {
    user,
    initialized,
    theme,
    telegramApi,
    WebApp: WebApp.isAvailable ? WebApp : null,
    walletInfo,
    loading,
    error,
    fetchWalletInfo,
    createWallet,
    requestAirdrop,
    setError
  };

  return (
    <TelegramContext.Provider value={context}>
      {children}
    </TelegramContext.Provider>
  );
};

// Custom hook to use Telegram context
export const useTelegram = () => {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error('useTelegram must be used within a TelegramProvider');
  }
  return context;
};

// Main component that wraps the app with Telegram theme
const TelegramApp = ({ children }) => {
  const { initialized, theme, loading, error } = useTelegram();

  if (loading) {
    return <div className="loading-container">Loading...</div>;
  }

  if (error) {
    return <div className="error-container">{error}</div>;
  }

  if (!initialized) {
    return <div className="loading-container">Initializing Telegram app...</div>;
  }

  return (
    <div className={`telegram-app ${theme}`}>
      {children}
    </div>
  );
};

export default TelegramApp;