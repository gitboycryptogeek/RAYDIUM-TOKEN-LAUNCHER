import React, { createContext, useContext } from 'react';
import { useTelegram } from './telegramApp';

// Create a context that mimics the wallet context
const TelegramWalletAdapterContext = createContext(null);

export const TelegramWalletAdapterProvider = ({ children }) => {
  const telegram = useTelegram();
  
  // Create an object that has the same shape as the old wallet context
  const walletAdapter = {
    publicKey: telegram.walletInfo?.publicKey || null,
    balance: telegram.walletInfo?.balance || 0,
    connected: !!telegram.walletInfo,
    connecting: telegram.loading,
    cluster: telegram.walletInfo?.cluster || 'devnet',
    connect: telegram.createWallet,
    disconnect: () => console.log('Disconnect not implemented in Telegram mode'),
    error: telegram.error,
    // Add other properties as needed
  };
  
  return (
    <TelegramWalletAdapterContext.Provider value={walletAdapter}>
      {children}
    </TelegramWalletAdapterContext.Provider>
  );
};

// Create a hook that mimics the useWallet hook
export const useWallet = () => {
  const context = useContext(TelegramWalletAdapterContext);
  if (!context) {
    throw new Error('useWallet must be used within a TelegramWalletAdapterProvider');
  }
  return context;
};