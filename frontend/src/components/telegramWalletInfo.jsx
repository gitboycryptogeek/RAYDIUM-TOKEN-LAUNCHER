import React, { createContext, useContext } from 'react';
import { useTelegram } from './telegramApp';

const TelegramWalletAdapterContext = createContext(null);

export const TelegramWalletAdapterProvider = ({ children }) => {
  const telegram = useTelegram();
  
  const walletAdapter = {
    publicKey: telegram.walletInfo?.publicKey || null,
    balance: telegram.walletInfo?.balance || 0,
    connected: !!telegram.walletInfo,
    connecting: telegram.loading,
    cluster: telegram.walletInfo?.cluster || 'devnet',
    connect: telegram.createWallet,
    disconnect: () => console.log('Disconnect not implemented in Telegram mode'),
    error: telegram.error,
  };
  
  return (
    <TelegramWalletAdapterContext.Provider value={walletAdapter}>
      {children}
    </TelegramWalletAdapterContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(TelegramWalletAdapterContext);
  if (!context) {
    throw new Error('useWallet must be used within a TelegramWalletAdapterProvider');
  }
  return context;
};