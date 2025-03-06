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
        console.log('Telegram init data:', initData);
        
        if (initData.user) {
          const userData = {
            id: initData.user.id,
            firstName: initData.user.first_name,
            lastName: initData.user.last_name,
            username: initData.user.username,
            languageCode: initData.user.language_code
          };
          
          setUser(userData);
          console.log('Telegram user data loaded:', userData);
          
          // Use the user data to get wallet info
          fetchWalletInfo(initData.user.id);
          
          // Store auth token for API calls
          sessionStorage.setItem('telegramInitData', WebApp.initData);
          axios.defaults.headers.common['X-Telegram-Init-Data'] = WebApp.initData;
        } else {
          console.warn('No user data in Telegram initData');
        }
      } catch (error) {
        console.error('Error parsing Telegram user data:', error);
        setError('Failed to get user data from Telegram');
      }
      
      setInitialized(true);
      
      // Set up event listeners
      WebApp.onEvent('themeChanged', () => {
        console.log('Telegram theme changed to:', WebApp.colorScheme);
        setTheme(WebApp.colorScheme || 'light');
      });
      
      WebApp.onEvent('viewportChanged', () => {
        console.log('Telegram viewport changed');
      });
      
      WebApp.onEvent('mainButtonClicked', () => {
        console.log('Telegram main button clicked');
      });
    } else {
      console.log('Telegram WebApp not available, running in browser mode');
      // For development without Telegram
      setInitialized(true);
      setUser({ id: 'dev_user', username: 'dev_user', firstName: 'Dev' });
      
      // Try to load wallet info for development user
      fetchWalletInfo('dev_user');
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
    if (!telegramId) {
      console.warn('Cannot fetch wallet info: No telegramId provided');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Fetching wallet info for telegramId: ${telegramId}`);
      const response = await axios.get(`/api/wallet/info?telegramId=${telegramId}`);
      
      if (response.data) {
        console.log('Wallet info received:', response.data);
        setWalletInfo(response.data);
      } else {
        console.log('No wallet found for this user');
        setWalletInfo(null);
      }
    } catch (error) {
      console.error('Error fetching wallet info:', error);
      setError('Failed to get wallet information');
    } finally {
      setLoading(false);
    }
  };

  // Create wallet for user
  const createWallet = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Creating wallet...');
      
      // Determine if we're in Telegram
      const isTelegramApp = window.Telegram && window.Telegram.WebApp;
      
      let requestData = {};
      
      if (isTelegramApp && user) {
        // We're in Telegram - use Telegram user data
        requestData = {
          telegramId: user.id,
          telegramUsername: user.username || user.firstName
        };
      } else {
        // We're on the web - generate a unique identifier
        const sessionId = localStorage.getItem('sessionId') || 
                         Math.random().toString(36).substring(2, 15);
        localStorage.setItem('sessionId', sessionId);
        
        requestData = {
          sessionId
        };
      }
      
      console.log('Creating wallet with data:', requestData);
      const response = await axios.post('/api/wallet/create', requestData);
      
      if (response.data) {
        console.log('Wallet created:', response.data);
        setWalletInfo(response.data);
        return response.data;
      } else {
        throw new Error('No wallet data returned from server');
      }
    } catch (error) {
      console.error('Error creating wallet:', error);
      setError('Failed to create wallet. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Request airdrop
  const requestAirdrop = async () => {
    if (!walletInfo?.publicKey) {
      console.error('Cannot request airdrop: No wallet available');
      return null;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Requesting airdrop for wallet: ${walletInfo.publicKey}`);
      const response = await axios.post('/api/wallet/airdrop', {
        publicKey: walletInfo.publicKey,
        amount: 1
      });
      
      if (response.data && response.data.success) {
        console.log('Airdrop successful:', response.data);
        
        // Refresh wallet info
        if (user && user.id) {
          await fetchWalletInfo(user.id);
        } else if (walletInfo.userId) {
          // Extract telegramId from userId (format: "telegram-123456789")
          const idMatch = walletInfo.userId.match(/^telegram-(\d+)$/);
          if (idMatch && idMatch[1]) {
            await fetchWalletInfo(idMatch[1]);
          }
        }
        
        return response.data;
      } else {
        throw new Error(response.data?.error || 'Airdrop failed');
      }
    } catch (error) {
      console.error('Error requesting airdrop:', error);
      
      // Handle rate limit errors specially
      if (error.response && error.response.status === 429) {
        setError('Airdrop rate limit reached. Please try again later.');
      } else {
        setError('Failed to request airdrop. The faucet might be unavailable.');
      }
      
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
      },
      offClick: (callback) => {
        if (WebApp.isAvailable) {
          WebApp.MainButton.offClick(callback);
        }
      },
      setParams: (params) => {
        if (WebApp.isAvailable) {
          WebApp.MainButton.setParams(params);
        }
      }
    },
    
    backButton: {
      show: () => {
        if (WebApp.isAvailable) {
          WebApp.BackButton.show();
        }
      },
      hide: () => {
        if (WebApp.isAvailable) {
          WebApp.BackButton.hide();
        }
      },
      onClick: (callback) => {
        if (WebApp.isAvailable) {
          WebApp.BackButton.onClick(callback);
        }
      },
      offClick: (callback) => {
        if (WebApp.isAvailable) {
          WebApp.BackButton.offClick(callback);
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
    },
    
    switchInlineQuery: (query) => {
      if (WebApp.isAvailable) {
        WebApp.switchInlineQuery(query);
      } else {
        console.log('SwitchInlineQuery (dev mode):', query);
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
    setError,
    
    // Additional helpers for token functions
    createToken: async (tokenData) => {
      setLoading(true);
      try {
        const response = await axios.post('/api/token/create', tokenData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        console.log('Token created:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error creating token:', error);
        setError('Failed to create token. Please try again.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    
    getUserTokens: async () => {
      if (!walletInfo?.publicKey) return [];
      
      try {
        const response = await axios.get(`/api/token/list?publicKey=${walletInfo.publicKey}`);
        return response.data || [];
      } catch (error) {
        console.error('Error getting user tokens:', error);
        return [];
      }
    },
    
    getPools: async () => {
      try {
        const response = await axios.get('/api/pool/list');
        return response.data || [];
      } catch (error) {
        console.error('Error getting pools:', error);
        return [];
      }
    },
    
    createPool: async (poolData) => {
      setLoading(true);
      try {
        const response = await axios.post('/api/token/create-with-pool', poolData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        console.log('Pool created:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error creating pool:', error);
        setError('Failed to create pool. Please try again.');
        return null;
      } finally {
        setLoading(false);
      }
    }
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

  if (!initialized) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Initializing Telegram app...</p>
      </div>
    );
  }

  if (error && !children) {
    return (
      <div className={`error-container ${theme}`}>
        <div className="error-icon">⚠️</div>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className={`telegram-app ${theme}`}>
      {loading && !children && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}
      {children}
    </div>
  );
};

export default TelegramApp;