import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import axios from '../axiosConfig';

const WalletContext = createContext();

export function WalletProvider({ children }) {
  const [wallet, setWallet] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [cluster, setCluster] = useState('devnet');
  const [error, setError] = useState(null);

  // Set up axios interceptors to always include wallet in requests
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use((config) => {
      // For GET requests, add publicKey as a query parameter if it exists
      if (config.method === 'get' && publicKey) {
        config.params = {
          ...config.params,
          publicKey: publicKey
        };
      }
      
      // For POST requests, add publicKey in the body if it exists
      if (config.method === 'post' && publicKey) {
        config.data = {
          ...config.data,
          userWallet: publicKey
        };
      }
      
      return config;
    });
    
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
    };
  }, [publicKey]);

  // Update balance when publicKey changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (publicKey) {
        try {
          const { data } = await axios.get(`/api/wallet/info?publicKey=${publicKey}`);
          setBalance(data.balance);
          setCluster(data.cluster);
        } catch (error) {
          console.error('Error fetching wallet info:', error);
          setError('Failed to fetch wallet balance');
        }
      }
    };

    fetchBalance();
  }, [publicKey]);

  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);
      
      // Check if Phantom is installed
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found. Please install it from https://phantom.app/');
      }
      
      const walletAdapter = new PhantomWalletAdapter();
      await walletAdapter.connect();
      
      const key = walletAdapter.publicKey.toString();
      
      setWallet(walletAdapter);
      setPublicKey(key);
      setConnected(true);
      
      return key;
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (wallet) {
        await wallet.disconnect();
      }
      setWallet(null);
      setPublicKey(null);
      setConnected(false);
      setBalance(0);
    } catch (err) {
      console.error('Disconnect error:', err);
      setError(err.message || 'Failed to disconnect wallet');
    }
  }, [wallet]);

  const value = {
    wallet,
    publicKey,
    connected,
    connecting,
    balance,
    cluster,
    error,
    connect,
    disconnect
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);

export default WalletContext;