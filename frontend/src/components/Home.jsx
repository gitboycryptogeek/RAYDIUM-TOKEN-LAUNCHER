import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Home.css';
import TokenCreationForm from './tokenCreationForm';
import PendingPoolManagement from './pendingPoolManagement';
import { useWallet } from '../components/telegramWalletAdapter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Helper utility to generate explorer URL based on cluster
const getExplorerUrl = (type, address, cluster) => {
  const baseUrl = 'https://explorer.solana.com';
  const clusterParam = cluster !== 'mainnet' ? `?cluster=${cluster}` : '';
  return `${baseUrl}/${type}/${address}${clusterParam}`;
};

const Home = () => {
  const { publicKey, connected, balance, cluster } = useWallet();
  const [activeTab, setActiveTab] = useState('create');
  const [userTokens, setUserTokens] = useState([]);
  const [userPools, setUserPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [success, setSuccess] = useState('');
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedPool, setSelectedPool] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [liquidityForm, setLiquidityForm] = useState({
    amount: '1',
    fixedSide: 'sol', // 'sol' or 'token'
    slippage: '1'
  });
  
  const [withdrawForm, setWithdrawForm] = useState({
    lpAmount: '0.5',
    slippage: '1'
  });
  
  const [swapForm, setSwapForm] = useState({
    amount: '0.1',
    fromToken: 'sol', // 'sol' or 'token'
    slippage: '1'
  });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  // Fetch user tokens with retry logic
  const fetchUserTokens = useCallback(async (showLoading = true) => {
    if (!connected || !publicKey) return;
    
    if (showLoading) setIsRefreshing(true);
    
    try {
      // Try up to 3 times with exponential backoff
      let retries = 3;
      let success = false;
      let tokensData = [];
      
      // Add random jitter to prevent synchronized requests
      const initialDelay = 1000 + Math.floor(Math.random() * 500);
      
      while (retries > 0 && !success) {
        try {
          const response = await axios.get(`${API_URL}/token/list`, {
            params: { publicKey },
            // Add a longer timeout 
            timeout: 30000
          });
          
          if (response.data && Array.isArray(response.data)) {
            tokensData = response.data;
            success = true;
          } else {
            throw new Error('Invalid response format');
          }
        } catch (e) {
          console.warn(`Token fetch attempt failed, ${retries-1} retries left`, e);
          retries--;
          
          if (retries > 0) {
            // Use exponential backoff with delay
            await delay(initialDelay * Math.pow(3, 3-retries));
          }
        }
      }
      
      console.log('Fetched tokens:', tokensData);
      setUserTokens(tokensData);
      
      // If not successful after all retries, look for local data
      if (!success) {
        // Try to get tokens from localStorage as a fallback
        try {
          const localTokens = localStorage.getItem('localTokens');
          if (localTokens) {
            const parsedTokens = JSON.parse(localTokens);
            if (Array.isArray(parsedTokens) && parsedTokens.length > 0) {
              console.log('Using locally stored tokens as fallback:', parsedTokens);
              setUserTokens(parsedTokens);
            }
          }
        } catch (e) {
          console.error('Error getting tokens from local storage:', e);
        }
      } else {
        // If successful, store tokens in localStorage for future fallback
        try {
          localStorage.setItem('localTokens', JSON.stringify(tokensData));
        } catch (e) {
          console.error('Error storing tokens in local storage:', e);
        }
      }
      
      // Update selected token if it exists
      if (selectedToken) {
        const updatedToken = tokensData.find(t => t.mint === selectedToken.mint);
        if (updatedToken) {
          setSelectedToken(updatedToken);
        }
      }
    } catch (error) {
      console.error('Error fetching user tokens:', error);
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, [connected, publicKey, selectedToken]);
  
  // Fetch user pools with retry logic
  const fetchUserPools = useCallback(async (showLoading = true) => {
    if (!connected || !publicKey) return;
    
    if (showLoading) setIsRefreshing(true);
    
    try {
      // Try up to 3 times with exponential backoff
      let retries = 3;
      let success = false;
      let poolsData = [];
      
      // Add random jitter to prevent synchronized requests
      const initialDelay = 1500 + Math.floor(Math.random() * 500);
      
      while (retries > 0 && !success) {
        try {
          const response = await axios.get(`${API_URL}/pool/list`, {
            params: { publicKey },
            // Add a longer timeout
            timeout: 30000
          });
          
          if (response.data && Array.isArray(response.data)) {
            poolsData = response.data;
            success = true;
          } else {
            throw new Error('Invalid response format');
          }
        } catch (e) {
          console.warn(`Pools fetch attempt failed, ${retries-1} retries left`, e);
          retries--;
          
          if (retries > 0) {
            // Use exponential backoff with delay
            await delay(initialDelay * Math.pow(3, 3-retries));
          }
        }
      }
      
      console.log('Fetched pools:', poolsData);
      
      // Get local pools to merge with API response (even if API failed)
      const localPools = localStorage.getItem('localPools');
      let parsedLocalPools = [];
      
      if (localPools) {
        try {
          parsedLocalPools = JSON.parse(localPools);
          
          if (success) {
            // Filter out local pools that now exist in the API response
            parsedLocalPools = parsedLocalPools.filter(lp => 
              !poolsData.some(p => p.baseMint === lp.baseMint && p.quoteMint === lp.quoteMint)
            );
            
            // Update localStorage with filtered pools
            localStorage.setItem('localPools', JSON.stringify(parsedLocalPools));
          }
        } catch (e) {
          console.error('Error parsing local pools:', e);
        }
      }
      
      // Merge API pools with local pools
      const mergedPools = [...poolsData, ...parsedLocalPools];
      
      setUserPools(mergedPools);
      
      // If the selected pool is in the list, update it with fresh data
      if (selectedPool) {
        const updatedPool = mergedPools.find(p => p.poolId === selectedPool.poolId);
        if (updatedPool) {
          setSelectedPool(updatedPool);
        }
      }
    } catch (error) {
      console.error('Error fetching user pools:', error);
      
      // If all API attempts failed, just use local pools
      try {
        const localPools = localStorage.getItem('localPools');
        if (localPools) {
          const parsedPools = JSON.parse(localPools);
          if (Array.isArray(parsedPools)) {
            console.log('Using locally stored pools as fallback:', parsedPools);
            setUserPools(parsedPools);
          }
        }
      } catch (e) {
        console.error('Error getting pools from local storage:', e);
      }
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, [connected, publicKey, selectedPool]);
  
  // Combined refresh function
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    setError('');
    
    try {
      await Promise.all([
        fetchUserTokens(false),
        fetchUserPools(false)
      ]);
      
      setSuccess('Data refreshed successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchUserTokens, fetchUserPools]);
  
  // Fetch data when wallet is connected
  useEffect(() => {
    if (connected && publicKey) {
      // Initial load with staggered requests
      const loadInitialData = async () => {
        // Load tokens first
        await fetchUserTokens();
        // Small delay before loading pools 
        await delay(500);
        await fetchUserPools();
      };
      
      loadInitialData();
  
      // Set up a refresh interval with lower frequency
      const intervalId = setInterval(async () => {
        await fetchUserTokens(false);
        // Small delay between requests to avoid rate limiting
        await delay(1000);
        await fetchUserPools(false);
      }, 30000); // Increased to 30 seconds to avoid rate limiting
  
      // Clear the interval when component unmounts
      return () => clearInterval(intervalId);
    } else {
      // Reset state when wallet is disconnected
      setUserTokens([]);
      setUserPools([]);
      setSelectedToken(null);
      setSelectedPool(null);
    }
  }, [connected, publicKey, fetchUserTokens, fetchUserPools]);
  
  // Handle form changes
  const handleChange = (formType, field, value) => {
    switch (formType) {
      case 'addLiquidity':
        setLiquidityForm(prev => ({ ...prev, [field]: value }));
        break;
      case 'removeLiquidity':
        setWithdrawForm(prev => ({ ...prev, [field]: value }));
        break;
      case 'swap':
        setSwapForm(prev => ({ ...prev, [field]: value }));
        break;
      default:
        break;
    }
  };
  
  // Enhanced token selection with support for tokens without pools
  const handleTokenSelect = (token) => {
    setSelectedToken(token);
    
    // Find the corresponding pool
    const pool = userPools.find(p => 
      p && (p.baseMint === token.mint || p.quoteMint === token.mint)
    );
    
    // If pool exists, use it
    if (pool) {
      setSelectedPool(pool);
      setActiveTab('manage');
      return;
    }
    
    // If no pool exists, check if there are any pools in the local storage
    const localPools = localStorage.getItem('localPools');
    let parsedLocalPools = [];
    
    if (localPools) {
      try {
        parsedLocalPools = JSON.parse(localPools);
      } catch (e) {
        console.error('Error parsing local pools:', e);
      }
    }
    
    // Find if there's a local pool for this token
    const localPool = parsedLocalPools.find(p => 
      p && (p.baseMint === token.mint || p.quoteMint === token.mint)
    );
    
    if (localPool) {
      setSelectedPool(localPool);
      setActiveTab('manage');
      return;
    }
    
    // If still no pool, we can create a custom placeholder pool object
    // This is helpful when only the token was created but market/pool creation failed
    const solMint = 'So11111111111111111111111111111111111111112';
    const placeholderPool = {
      poolId: 'local-' + token.mint.substring(0, 8),
      marketId: 'pending',
      baseMint: token.mint,
      quoteMint: solMint,
      baseSymbol: token.symbol || token.mint.substring(0, 4),
      quoteSymbol: 'SOL',
      lpBalance: { balance: 0 },
      isPending: true, // Flag to indicate this is not a real pool yet
      isPlaceholder: true
    };
    
    setSelectedPool(placeholderPool);
    
    // Add to local storage for future use
    parsedLocalPools.push(placeholderPool);
    try {
      localStorage.setItem('localPools', JSON.stringify(parsedLocalPools));
    } catch (e) {
      console.error('Error saving local pools:', e);
    }
    
    setActiveTab('manage');
  };

  // Airdrop handling
  const [airdropLoading, setAirdropLoading] = useState(false);

  const requestAirdrop = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    setAirdropLoading(true);
    setError('');
    
    try {
      const response = await axios.post(`${API_URL}/wallet/airdrop`, {
        publicKey,
        amount: 1 // Request 1 SOL
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      // Show success message
      setSuccess(`Successfully airdropped 1 SOL to your wallet. It may take a few seconds to appear.`);
      
      // Wait 5 seconds before updating balance display
      setTimeout(() => {
        // You would typically refresh wallet info here
        // If you have a refreshWalletInfo function, call it here
        refreshData();
      }, 5000);
      
    } catch (error) {
      console.error('Error requesting airdrop:', error);
      setError(error.response?.data?.error || error.message || 'Failed to request airdrop');
    } finally {
      setAirdropLoading(false);
    }
  };
  
  // Handle token creation success
  const handleTokenCreationSuccess = useCallback((tokenData) => {
    setResult(tokenData);
    setSuccess(`Token ${tokenData.name} (${tokenData.symbol}) created successfully!`);
    
    // If token has a pool, select it
    if (tokenData.pool) {
      const newToken = {
        mint: tokenData.mint,
        symbol: tokenData.symbol,
        name: tokenData.name,
        balance: tokenData.initialSupply || 0,
        decimals: tokenData.decimals
      };
      
      setSelectedToken(newToken);
      setSelectedPool(tokenData.pool);
    }
    
    // Refresh data with a short delay to allow blockchain to update
    setTimeout(() => {
      fetchUserTokens();
      fetchUserPools();
    }, 2000);
  }, [fetchUserTokens, fetchUserPools]);
  
  // Handle pool creation success
  const handlePoolCreated = useCallback((poolData) => {
    // Update the selected pool
    setSelectedPool(poolData);
    
    // Show success message
    setSuccess(`Pool created successfully!`);
    
    // Refresh data
    fetchUserPools();
    
    // Update local storage
    try {
      const localPools = localStorage.getItem('localPools');
      let parsedLocalPools = localPools ? JSON.parse(localPools) : [];
      
      // Replace the placeholder pool with the real one
      const updatedPools = parsedLocalPools.filter(p => 
        !(p.baseMint === poolData.baseMint && p.isPending)
      );
      
      localStorage.setItem('localPools', JSON.stringify(updatedPools));
    } catch (e) {
      console.error('Error updating local pools:', e);
    }
  }, [fetchUserPools]);
  
  // Handle form submission for liquidity and swap operations
  const handleSubmit = async (formType) => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    setResult(null);
    
    try {
      let response;
      
      switch (formType) {
        case 'addLiquidity': {
          if (!selectedPool) {
            throw new Error('No pool selected');
          }
          
          if (selectedPool.isPending || selectedPool.isPlaceholder) {
            throw new Error('This pool is pending creation. Create a pool first.');
          }
          
          // Determine if we're dealing with SOL as token A or B
          const isSolTokenB = selectedPool.quoteMint === 'So11111111111111111111111111111111111111112';
          
          const payload = {
            poolId: selectedPool.poolId,
            amount: parseFloat(liquidityForm.amount),
            fixedSide: liquidityForm.fixedSide === 'sol' 
              ? (isSolTokenB ? 'b' : 'a') 
              : (isSolTokenB ? 'a' : 'b'),
            slippage: parseFloat(liquidityForm.slippage),
            userWallet: publicKey
          };
          
          response = await axios.post(`${API_URL}/liquidity/add`, payload);
          setSuccess('Liquidity added successfully!');
          break;
        }
        case 'removeLiquidity': {
          if (!selectedPool) {
            throw new Error('No pool selected');
          }
          
          if (selectedPool.isPending || selectedPool.isPlaceholder) {
            throw new Error('This pool is pending creation. Create a pool first.');
          }
          
          const payload = {
            poolId: selectedPool.poolId,
            lpAmount: parseFloat(withdrawForm.lpAmount),
            slippage: parseFloat(withdrawForm.slippage),
            userWallet: publicKey
          };
          
          response = await axios.post(`${API_URL}/liquidity/remove`, payload);
          setSuccess('Liquidity removed successfully!');
          break;
        }
        case 'swap': {
          if (!selectedPool || !selectedToken) {
            throw new Error('No pool or token selected');
          }
          
          if (selectedPool.isPending || selectedPool.isPlaceholder) {
            throw new Error('This pool is pending creation. Create a pool first.');
          }
          
          const solMint = 'So11111111111111111111111111111111111111112'; // Native SOL mint
          
          const payload = {
            poolId: selectedPool.poolId,
            inputMint: swapForm.fromToken === 'sol' ? solMint : selectedToken.mint,
            amount: parseFloat(swapForm.amount),
            fixedSide: 'in',
            slippage: parseFloat(swapForm.slippage),
            userWallet: publicKey
          };
          
          response = await axios.post(`${API_URL}/swap`, payload);
          setSuccess('Swap executed successfully!');
          break;
        }
        default:
          throw new Error('Invalid form type');
      }
      
      setResult(response.data);
      
      // Refresh tokens and pools
      setTimeout(() => {
        fetchUserTokens();
        fetchUserPools();
      }, 2000);
    } catch (error) {
      console.error(`Error submitting ${formType} form:`, error);
      setError(error.response?.data?.error || error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className='container'>
      <header className='header'>
        <h1>Solana Token Launcher</h1>
        <div className='wallet-info'>
          <p><strong>Wallet:</strong> {connected ? (publicKey ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}` : 'Loading...') : 'Not Connected'}</p>
          <p><strong>Network:</strong> {cluster || 'Loading...'}</p>
          <p>
            <strong>Balance:</strong> {connected ? (balance !== undefined ? balance.toFixed(4) : 'Loading...') : '0.0000'} SOL
            {connected && cluster === 'devnet' && (
              <button 
                className='airdrop-button' 
                onClick={requestAirdrop}
                disabled={airdropLoading}
              >
                {airdropLoading ? 'Requesting...' : 'Get 1 SOL'}
              </button>
            )}
          </p>
          {connected && (
            <button 
              className='refresh-button' 
              onClick={refreshData}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
          )}
        </div>
      </header>
      
      {/* Tokens sidebar */}
      <div className='sidebar'>
        <h3>Your Tokens</h3>
        {!connected ? (
          <p>Connect your wallet to see your tokens</p>
        ) : isRefreshing ? (
          <p>Loading tokens...</p>
        ) : userTokens.length > 0 ? (
          <div className='token-list'>
            {userTokens.map((token) => (
              <div 
                key={token.mint} 
                className={`token-item ${selectedToken?.mint === token.mint ? 'selected' : ''}`}
                onClick={() => handleTokenSelect(token)}
              >
                <p><strong>{token.symbol || `${token.mint.slice(0, 4)}...${token.mint.slice(-4)}`}</strong></p>
                <p>Balance: {typeof token.balance === 'number' ? token.balance.toFixed(6) : token.balance}</p>
                {userPools.some(p => p && (p.baseMint === token.mint || p.quoteMint === token.mint)) && (
                  <p className="pool-badge">Has Pool</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>
            <p>No tokens found</p>
            <p className="help-text">Create a token to get started!</p>
          </div>
        )}
      </div>
      
      <div className='tabs'>
        <button 
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}
        >
          Create Token & Pool
        </button>
        <button 
          className={activeTab === 'manage' ? 'active' : ''}
          onClick={() => setActiveTab('manage')}
          disabled={!selectedToken} // Only disable if no token is selected
        >
          Manage Pool
        </button>
      </div>
      
      <div className='content'>
        {/* Token Creation Form */}
        {activeTab === 'create' && (
          <TokenCreationForm onSuccess={handleTokenCreationSuccess} refreshData={refreshData} />
        )}
        
        {/* Pending Pool Management */}
        {activeTab === 'manage' && selectedToken && selectedPool && (selectedPool.isPending || selectedPool.isPlaceholder) && (
          <PendingPoolManagement 
            token={selectedToken} 
            onPoolCreated={handlePoolCreated} 
            refreshData={refreshData}
          />
        )}
        
        {/* Manage Pool Form (Add/Remove Liquidity, Swap) */}
        {activeTab === 'manage' && selectedToken && selectedPool && !selectedPool.isPending && !selectedPool.isPlaceholder && (
          <div className='pool-management'>
            <div className='pool-info'>
              <h2>Pool Management</h2>
              <p><strong>Selected Token:</strong> {selectedToken.symbol || selectedToken.mint.slice(0, 10)}...</p>
              <p><strong>Pool ID:</strong> {selectedPool.poolId.slice(0, 10)}...</p>
              {selectedPool.lpBalance && (
                <p><strong>Your LP Balance:</strong> {selectedPool.lpBalance.balance}</p>
              )}
              {selectedPool.initialPrice && (
                <p><strong>Initial Price:</strong> {selectedPool.initialPrice.toFixed(9)} SOL per token</p>
              )}
            </div>
            
            <div className='accordion'>
              {/* Add Liquidity Section */}
              <div className='accordion-item'>
                <h3 className='accordion-header'>Add Liquidity</h3>
                <div className='accordion-content'>
                  <div className='form-group'>
                    <label>Amount:</label>
                    <input 
                      type='number' 
                      value={liquidityForm.amount} 
                      onChange={(e) => handleChange('addLiquidity', 'amount', e.target.value)}
                      min='0.000001'
                      step='0.000001'
                    />
                  </div>
                  <div className='form-group'>
                    <label>Fixed Side:</label>
                    <select
                      value={liquidityForm.fixedSide}
                      onChange={(e) => handleChange('addLiquidity', 'fixedSide', e.target.value)}
                    >
                      <option value='sol'>SOL</option>
                      <option value='token'>{selectedToken.symbol || 'Token'}</option>
                    </select>
                  </div>
                  <div className='form-group'>
                    <label>Slippage (%):</label>
                    <input 
                      type='number' 
                      value={liquidityForm.slippage} 
                      onChange={(e) => handleChange('addLiquidity', 'slippage', e.target.value)}
                      min='0.01'
                      max='100'
                      step='0.01'
                    />
                  </div>
                  <button 
                    onClick={() => handleSubmit('addLiquidity')} 
                    disabled={loading || !connected}
                    className='submit-btn'
                  >
                    {loading ? 'Adding...' : 'Add Liquidity'}
                  </button>
                </div>
              </div>
              
              {/* Remove Liquidity Section */}
              <div className='accordion-item'>
                <h3 className='accordion-header'>Remove Liquidity</h3>
                <div className='accordion-content'>
                  <div className='form-group'>
                    <label>LP Amount:</label>
                    <input 
                      type='number' 
                      value={withdrawForm.lpAmount} 
                      onChange={(e) => handleChange('removeLiquidity', 'lpAmount', e.target.value)}
                      min='0.000001'
                      step='0.000001'
                    />
                  </div>
                  <div className='form-group'>
                    <label>Slippage (%):</label>
                    <input 
                      type='number' 
                      value={withdrawForm.slippage} 
                      onChange={(e) => handleChange('removeLiquidity', 'slippage', e.target.value)}
                      min='0.01'
                      max='100'
                      step='0.01'
                    />
                  </div>
                  <button 
                    onClick={() => handleSubmit('removeLiquidity')} 
                    disabled={loading || !connected}
                    className='submit-btn'
                  >
                    {loading ? 'Removing...' : 'Remove Liquidity'}
                  </button>
                </div>
              </div>
              
              {/* Swap Section */}
              <div className='accordion-item'>
                <h3 className='accordion-header'>Swap</h3>
                <div className='accordion-content'>
                  <div className='form-group'>
                    <label>From:</label>
                    <select
                      value={swapForm.fromToken}
                      onChange={(e) => handleChange('swap', 'fromToken', e.target.value)}
                    >
                      <option value='sol'>SOL</option>
                      <option value='token'>{selectedToken.symbol || 'Token'}</option>
                    </select>
                  </div>
                  <div className='form-group'>
                    <label>To:</label>
                    <div className='static-input'>
                      {swapForm.fromToken === 'sol' ? (selectedToken.symbol || 'Token') : 'SOL'}
                    </div>
                  </div>
                  <div className='form-group'>
                    <label>Amount:</label>
                    <input 
                      type='number' 
                      value={swapForm.amount} 
                      onChange={(e) => handleChange('swap', 'amount', e.target.value)}
                      min='0.000001'
                      step='0.000001'
                    />
                  </div>
                  <div className='form-group'>
                    <label>Slippage (%):</label>
                    <input 
                      type='number' 
                      value={swapForm.slippage} 
                      onChange={(e) => handleChange('swap', 'slippage', e.target.value)}
                      min='0.01'
                      max='100'
                      step='0.01'
                    />
                  </div>
                  <button 
                    onClick={() => handleSubmit('swap')} 
                    disabled={loading || !connected}
                    className='submit-btn'
                  >
                    {loading ? 'Swapping...' : 'Swap'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'manage' && !selectedToken && (
          <div className='empty-state'>
            <h3>No Token Selected</h3>
            <p>Please select a token from the sidebar to manage.</p>
          </div>
        )}
        
        {/* Result Section */}
        {error && <div className='error-container'>{error}</div>}
        {success && <div className='success-container'>{success}</div>}
        
        {result && (
          <div className='result-container'>
            <h3>Result:</h3>
            <pre>{JSON.stringify(result, null, 2)}</pre>
            {result.txId && (
              <a 
                href={getExplorerUrl('tx', result.txId, cluster)} 
                target='_blank' 
                rel='noopener noreferrer'
                className='explorer-link'
              >
                View Transaction on Solana Explorer
              </a>
            )}
            {result.mint && (
              <a 
                href={getExplorerUrl('address', result.mint, cluster)} 
                target='_blank' 
                rel='noopener noreferrer'
                className='explorer-link'
                style={{ marginLeft: '10px' }}
              >
                View Token on Solana Explorer
              </a>
            )}
            {result.pool && result.pool.poolId && (
              <a 
                href={getExplorerUrl('address', result.pool.poolId, cluster)} 
                target='_blank' 
                rel='noopener noreferrer'
                className='explorer-link'
                style={{ marginLeft: '10px' }}
              >
                View Pool on Solana Explorer
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;