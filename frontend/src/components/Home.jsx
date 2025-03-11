import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import './Home.css';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Helper utility to generate explorer URL based on cluster
const getExplorerUrl = (type, address, cluster) => {
  const baseUrl = 'https://explorer.solana.com';
  const clusterParam = cluster !== 'mainnet' ? `?cluster=${cluster}` : '';
  return `${baseUrl}/${type}/${address}${clusterParam}`;
};

// Token Card Component
const TokenCard = ({ token, onSelect, isSelected, hasPool }) => {
  return (
    <div 
      className={`token-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(token)}
    >
      <div className="token-icon">
        {token.symbol ? token.symbol.charAt(0) : '#'}
      </div>
      <div className="token-details">
        <h3>{token.symbol || `${token.mint.slice(0, 4)}...`}</h3>
        <p className="token-balance">{token.balance.toFixed(4)}</p>
        {hasPool ? (
          <span className="pool-badge">Has Pool</span>
        ) : (
          <span className="no-pool-badge">No Pool</span>
        )}
      </div>
    </div>
  );
};

// Pool Management Tab Component - Add Liquidity
const AddLiquidityTab = ({ 
  selectedToken, 
  selectedPool, 
  handleSubmit, 
  loading,
  liquidityForm, 
  handleChange, 
  connected 
}) => {
  return (
    <div className="tab-pane active">
      <div className="form-card">
        <div className="form-group">
          <label>Amount</label>
          <input 
            type="number" 
            value={liquidityForm.amount} 
            onChange={(e) => handleChange('addLiquidity', 'amount', e.target.value)}
            min="0.000001"
            step="0.000001"
            className="modern-input"
          />
        </div>
        <div className="form-group">
          <label>Fixed Side</label>
          <div className="toggle-switch">
            <input 
              type="radio"
              id="sol-toggle"
              name="fixedSide"
              checked={liquidityForm.fixedSide === 'sol'}
              onChange={() => handleChange('addLiquidity', 'fixedSide', 'sol')}
            />
            <label htmlFor="sol-toggle">SOL</label>
            
            <input 
              type="radio"
              id="token-toggle"
              name="fixedSide"
              checked={liquidityForm.fixedSide === 'token'}
              onChange={() => handleChange('addLiquidity', 'fixedSide', 'token')}
            />
            <label htmlFor="token-toggle">{selectedToken.symbol || 'Token'}</label>
          </div>
        </div>
        <div className="form-group">
          <label>Slippage (%)</label>
          <div className="slider-container">
            <input 
              type="range" 
              min="0.1" 
              max="5" 
              step="0.1"
              value={liquidityForm.slippage}
              onChange={(e) => handleChange('addLiquidity', 'slippage', e.target.value)}
              className="modern-slider"
            />
            <span className="slider-value">{liquidityForm.slippage}%</span>
          </div>
        </div>
        <button 
          onClick={() => handleSubmit('addLiquidity')} 
          disabled={loading || !connected}
          className="action-button primary"
        >
          {loading ? 'Adding...' : 'Add Liquidity'}
        </button>
      </div>
    </div>
  );
};

// Pool Management Tab Component - Remove Liquidity
const RemoveLiquidityTab = ({ 
  selectedToken, 
  selectedPool, 
  handleSubmit, 
  loading,
  withdrawForm, 
  handleChange, 
  connected 
}) => {
  return (
    <div className="tab-pane">
      <div className="form-card">
        <div className="form-group">
          <label>LP Amount</label>
          <input 
            type="number" 
            value={withdrawForm.lpAmount} 
            onChange={(e) => handleChange('removeLiquidity', 'lpAmount', e.target.value)}
            min="0.000001"
            step="0.000001"
            className="modern-input"
          />
          <small className="input-help">
            Available LP tokens: {selectedPool.lpBalance?.balance || 0}
          </small>
        </div>
        <div className="form-group">
          <label>Slippage (%)</label>
          <div className="slider-container">
            <input 
              type="range" 
              min="0.1" 
              max="5" 
              step="0.1"
              value={withdrawForm.slippage}
              onChange={(e) => handleChange('removeLiquidity', 'slippage', e.target.value)}
              className="modern-slider"
            />
            <span className="slider-value">{withdrawForm.slippage}%</span>
          </div>
        </div>
        <button 
          onClick={() => handleSubmit('removeLiquidity')} 
          disabled={loading || !connected || (selectedPool.lpBalance?.balance <= 0)}
          className="action-button primary"
        >
          {loading ? 'Removing...' : 'Remove Liquidity'}
        </button>
      </div>
    </div>
  );
};

// Pool Management Tab Component - Swap
const SwapTab = ({ 
  selectedToken, 
  selectedPool, 
  handleSubmit, 
  loading,
  swapForm, 
  handleChange, 
  connected 
}) => {
  return (
    <div className="tab-pane">
      <div className="form-card">
        <div className="form-group">
          <label>From</label>
          <div className="toggle-switch">
            <input 
              type="radio"
              id="from-sol"
              name="fromToken"
              checked={swapForm.fromToken === 'sol'}
              onChange={() => handleChange('swap', 'fromToken', 'sol')}
            />
            <label htmlFor="from-sol">SOL</label>
            
            <input 
              type="radio"
              id="from-token"
              name="fromToken"
              checked={swapForm.fromToken === 'token'}
              onChange={() => handleChange('swap', 'fromToken', 'token')}
            />
            <label htmlFor="from-token">{selectedToken.symbol || 'Token'}</label>
          </div>
        </div>
        <div className="swap-arrow">
          <span>↓</span>
        </div>
        <div className="form-group">
          <label>To</label>
          <div className="static-input">
            {swapForm.fromToken === 'sol' ? (selectedToken.symbol || 'Token') : 'SOL'}
          </div>
        </div>
        <div className="form-group">
          <label>Amount</label>
          <input 
            type="number" 
            value={swapForm.amount} 
            onChange={(e) => handleChange('swap', 'amount', e.target.value)}
            min="0.000001"
            step="0.000001"
            className="modern-input"
          />
        </div>
        <div className="form-group">
          <label>Slippage (%)</label>
          <div className="slider-container">
            <input 
              type="range" 
              min="0.1" 
              max="5" 
              step="0.1"
              value={swapForm.slippage}
              onChange={(e) => handleChange('swap', 'slippage', e.target.value)}
              className="modern-slider"
            />
            <span className="slider-value">{swapForm.slippage}%</span>
          </div>
        </div>
        <button 
          onClick={() => handleSubmit('swap')} 
          disabled={loading || !connected}
          className="action-button primary"
        >
          {loading ? 'Swapping...' : 'Swap'}
        </button>
      </div>
    </div>
  );
};

// Pool Management Tabs Container
const PoolManagementTabs = ({ 
  selectedToken, 
  selectedPool, 
  handleSubmit, 
  loading,
  liquidityForm, 
  withdrawForm, 
  swapForm, 
  handleChange, 
  connected 
}) => {
  const [activeTab, setActiveTab] = useState('addLiquidity');

  return (
    <div className="pool-management">
      <div className="pool-info-card">
        <h2>Pool Details</h2>
        <div className="pool-info-grid">
          <div className="info-item">
            <span className="info-label">Token</span>
            <span className="info-value">{selectedToken.symbol || selectedToken.mint.slice(0, 10)}...</span>
          </div>
          <div className="info-item">
            <span className="info-label">Pool ID</span>
            <span className="info-value">{selectedPool.poolId.slice(0, 10)}...</span>
          </div>
          {selectedPool.lpBalance && (
            <div className="info-item">
              <span className="info-label">LP Balance</span>
              <span className="info-value">{selectedPool.lpBalance.balance}</span>
            </div>
          )}
          {selectedPool.initialPrice && (
            <div className="info-item">
              <span className="info-label">Initial Price</span>
              <span className="info-value">{selectedPool.initialPrice.toFixed(9)} SOL</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="actions-tabs">
        <div className="tabs-header">
          <button 
            className={`tab-button ${activeTab === 'addLiquidity' ? 'active' : ''}`}
            onClick={() => setActiveTab('addLiquidity')}
          >
            Add Liquidity
          </button>
          <button 
            className={`tab-button ${activeTab === 'removeLiquidity' ? 'active' : ''}`}
            onClick={() => setActiveTab('removeLiquidity')}
          >
            Remove Liquidity
          </button>
          <button 
            className={`tab-button ${activeTab === 'swap' ? 'active' : ''}`}
            onClick={() => setActiveTab('swap')}
          >
            Swap
          </button>
        </div>
        
        <div className="tab-content">
          {activeTab === 'addLiquidity' && (
            <AddLiquidityTab
              selectedToken={selectedToken}
              selectedPool={selectedPool}
              handleSubmit={handleSubmit}
              loading={loading}
              liquidityForm={liquidityForm}
              handleChange={handleChange}
              connected={connected}
            />
          )}
          
          {activeTab === 'removeLiquidity' && (
            <RemoveLiquidityTab
              selectedToken={selectedToken}
              selectedPool={selectedPool}
              handleSubmit={handleSubmit}
              loading={loading}
              withdrawForm={withdrawForm}
              handleChange={handleChange}
              connected={connected}
            />
          )}
          
          {activeTab === 'swap' && (
            <SwapTab
              selectedToken={selectedToken}
              selectedPool={selectedPool}
              handleSubmit={handleSubmit}
              loading={loading}
              swapForm={swapForm}
              handleChange={handleChange}
              connected={connected}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Main Home Component
const Home = () => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [userTokens, setUserTokens] = useState([]);
  const [userPools, setUserPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [success, setSuccess] = useState('');
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedPool, setSelectedPool] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();
  const { tokenId, poolId } = useParams();
  const cluster = process.env.REACT_APP_SOLANA_CLUSTER || 'devnet';
  
  const [liquidityForm, setLiquidityForm] = useState({
    amount: '1',
    fixedSide: 'sol',
    slippage: '1'
  });
  
  const [withdrawForm, setWithdrawForm] = useState({
    lpAmount: '0.5',
    slippage: '1'
  });
  
  const [swapForm, setSwapForm] = useState({
    amount: '0.1',
    fromToken: 'sol',
    slippage: '1'
  });

  // Delay helper function
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
            params: { publicKey: publicKey.toString() },
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
            await delay(initialDelay * Math.pow(3, 3-retries));
          }
        }
      }
      
      console.log('Fetched tokens:', tokensData);
      setUserTokens(tokensData);
      
      // Fallback to local storage if API fails
      if (!success) {
        try {
          const localTokens = localStorage.getItem('localTokens');
          if (localTokens) {
            const parsedTokens = JSON.parse(localTokens);
            if (Array.isArray(parsedTokens) && parsedTokens.length > 0) {
              setUserTokens(parsedTokens);
            }
          }
        } catch (e) {
          console.error('Error getting tokens from local storage:', e);
        }
      } else {
        // Store successful results for future fallback
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

      // If we have a tokenId param but no selected token, try to select it
      if (tokenId && !selectedToken) {
        const token = tokensData.find(t => t.mint === tokenId);
        if (token) {
          setSelectedToken(token);
        }
      }
    } catch (error) {
      console.error('Error fetching user tokens:', error);
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, [connected, publicKey, selectedToken, tokenId]);
  
  // Fetch user pools with retry logic
  const fetchUserPools = useCallback(async (showLoading = true) => {
    if (!connected || !publicKey) return;
    
    if (showLoading) setIsRefreshing(true);
    
    try {
      // Try up to 3 times with exponential backoff
      let retries = 3;
      let success = false;
      let poolsData = [];
      
      while (retries > 0 && !success) {
        try {
          const response = await axios.get(`${API_URL}/pool/list`, {
            params: { publicKey: publicKey.toString() },
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
            await delay(1500 * Math.pow(3, 3-retries));
          }
        }
      }
      
      // Merge with local pools
      const localPools = localStorage.getItem('localPools');
      let parsedLocalPools = [];
      
      if (localPools) {
        try {
          parsedLocalPools = JSON.parse(localPools);
          
          if (success) {
            // Filter out duplicates
            parsedLocalPools = parsedLocalPools.filter(lp => 
              !poolsData.some(p => p.baseMint === lp.baseMint && p.quoteMint === lp.quoteMint)
            );
            localStorage.setItem('localPools', JSON.stringify(parsedLocalPools));
          }
        } catch (e) {
          console.error('Error parsing local pools:', e);
        }
      }
      
      // Merge API pools with local pools
      const mergedPools = [...poolsData, ...parsedLocalPools];
      setUserPools(mergedPools);
      
      // Update selected pool if needed
      if (selectedPool) {
        const updatedPool = mergedPools.find(p => p.poolId === selectedPool.poolId);
        if (updatedPool) {
          setSelectedPool(updatedPool);
        }
      }

      // If we have a selected token but no selected pool, try to find a matching pool
      if (selectedToken && !selectedPool) {
        const matchingPool = mergedPools.find(p => 
          p.baseMint === selectedToken.mint || p.quoteMint === selectedToken.mint
        );
        if (matchingPool) {
          setSelectedPool(matchingPool);
        }
      }

      // If we have a poolId param but no selected pool, try to select it
      if (poolId && !selectedPool) {
        const pool = mergedPools.find(p => p.poolId === poolId);
        if (pool) {
          setSelectedPool(pool);
          // Also try to find and set the associated token
          const token = userTokens.find(t => 
            t.mint === pool.baseMint || t.mint === pool.quoteMint
          );
          if (token) {
            setSelectedToken(token);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user pools:', error);
      
      // Fallback to local pools
      try {
        const localPools = localStorage.getItem('localPools');
        if (localPools) {
          const parsedPools = JSON.parse(localPools);
          if (Array.isArray(parsedPools)) {
            setUserPools(parsedPools);
          }
        }
      } catch (e) {
        console.error('Error getting pools from local storage:', e);
      }
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  }, [connected, publicKey, selectedPool, selectedToken, poolId, userTokens]);
  
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
      const loadInitialData = async () => {
        await fetchUserTokens();
        await delay(500);
        await fetchUserPools();
      };
      
      loadInitialData();
  
      const intervalId = setInterval(async () => {
        await fetchUserTokens(false);
        await delay(2000);
        await fetchUserPools(false);
      }, 60000);
  
      return () => clearInterval(intervalId);
    } else {
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
  
  // Token selection with pool finding
  const handleTokenSelect = (token) => {
    setSelectedToken(token);
    
    // Find the corresponding pool
    const pool = userPools.find(p => 
      p && (p.baseMint === token.mint || p.quoteMint === token.mint)
    );
    
    if (pool) {
      setSelectedPool(pool);
      navigate(`/token/${token.mint}`);
      return;
    }
    
    // Check local pools
    const localPools = localStorage.getItem('localPools');
    let parsedLocalPools = [];
    
    if (localPools) {
      try {
        parsedLocalPools = JSON.parse(localPools);
      } catch (e) {
        console.error('Error parsing local pools:', e);
      }
    }
    
    const localPool = parsedLocalPools.find(p => 
      p && (p.baseMint === token.mint || p.quoteMint === token.mint)
    );
    
    if (localPool) {
      setSelectedPool(localPool);
      navigate(`/token/${token.mint}`);
      return;
    }
    
    // Create placeholder pool
    const solMint = 'So11111111111111111111111111111111111111112';
    const placeholderPool = {
      poolId: 'local-' + token.mint.substring(0, 8),
      marketId: 'pending',
      baseMint: token.mint,
      quoteMint: solMint,
      baseSymbol: token.symbol || token.mint.substring(0, 4),
      quoteSymbol: 'SOL',
      lpBalance: { balance: 0 },
      isPending: true,
      isPlaceholder: true
    };
    
    setSelectedPool(placeholderPool);
    
    // Add to local storage
    parsedLocalPools.push(placeholderPool);
    try {
      localStorage.setItem('localPools', JSON.stringify(parsedLocalPools));
    } catch (e) {
      console.error('Error saving local pools:', e);
    }
    
    navigate(`/token/${token.mint}`);
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
      // Try to request airdrop directly first
      try {
        const signature = await connection.requestAirdrop(publicKey, 1 * 1e9); // 1 SOL in lamports
        await connection.confirmTransaction(signature);
        setSuccess('Successfully received 1 SOL airdrop from devnet.');
        
        setTimeout(() => {
          refreshData();
        }, 2000);
        
        return;
      } catch (directAirdropError) {
        console.warn('Direct airdrop failed, trying API:', directAirdropError);
      }
      
      // Fall back to API if direct airdrop fails
      const response = await axios.post(`${API_URL}/wallet/airdrop`, {
        publicKey: publicKey.toString(),
        amount: 1 // Request 1 SOL
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      setSuccess(`Successfully airdropped 1 SOL to your wallet. It may take a few seconds to appear.`);
      
      setTimeout(() => {
        refreshData();
      }, 5000);
      
    } catch (error) {
      console.error('Error requesting airdrop:', error);
      setError(error.response?.data?.error || error.message || 'Failed to request airdrop');
    } finally {
      setAirdropLoading(false);
    }
  };
  
  // Form submission for liquidity and swap operations
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
            userWallet: publicKey.toString()
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
          
          if (!selectedPool.lpBalance || selectedPool.lpBalance.balance <= 0) {
            throw new Error('You do not have any LP tokens to remove');
          }
          
          const payload = {
            poolId: selectedPool.poolId,
            lpAmount: parseFloat(withdrawForm.lpAmount),
            slippage: parseFloat(withdrawForm.slippage),
            userWallet: publicKey.toString()
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
            userWallet: publicKey.toString()
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
    <div className="modern-container">
      <div className="dashboard-header">
        <h1>My Token Dashboard</h1>
        <div className="header-actions">
          {connected && cluster === 'devnet' && (
            <button 
              className="airdrop-button" 
              onClick={requestAirdrop}
              disabled={airdropLoading}
            >
              {airdropLoading ? 'Requesting...' : 'Get 1 SOL'}
            </button>
          )}
          <button 
            className="refresh-button" 
            onClick={refreshData}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <>
                <span className="loading-spinner small"></span>
                <span className="refresh-text">Refreshing</span>
              </>
            ) : 'Refresh'}
          </button>
        </div>
      </div>
      
      {error && <div className="error-alert">{error}</div>}
      {success && <div className="success-alert">{success}</div>}
      
      <div className="dashboard-layout">
        <section className="token-sidebar">
          <div className="token-header">
            <h2>My Tokens</h2>
            {isRefreshing && <div className="loading-spinner"></div>}
          </div>
          
          {!connected ? (
            <div className="connect-prompt">
              <p>Connect your wallet to view your tokens</p>
            </div>
          ) : userTokens.length > 0 ? (
            <div className="tokens-grid">
              {userTokens.map((token) => (
                <TokenCard 
                  key={token.mint}
                  token={token}
                  onSelect={handleTokenSelect}
                  isSelected={selectedToken?.mint === token.mint}
                  hasPool={userPools.some(p => p && (p.baseMint === token.mint || p.quoteMint === token.mint))}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No tokens found</p>
              <p className="secondary-text">Create a token to get started!</p>
            </div>
          )}
        </section>
        
        <section className="content-area">
          {!selectedToken ? (
            <div className="welcome-panel">
              <h2>Welcome to Solana Token Hub</h2>
              <p>Select a token from the sidebar or create a new token to get started.</p>
              <div className="action-buttons">
                <button 
                  className="action-button primary"
                  onClick={() => navigate('/create-token')}
                >
                  Create Token
                </button>
                <button 
                  className="action-button secondary"
                  onClick={() => navigate('/create-pool')}
                >
                  Create Pool
                </button>
              </div>
            </div>
          ) : (
            <div className="token-detail-panel">
              <div className="token-header">
                <div className="token-title">
                  <h2>{selectedToken.symbol || 'Token'}</h2>
                  <span className="token-mint">{selectedToken.mint.slice(0, 6)}...{selectedToken.mint.slice(-4)}</span>
                </div>
                <a 
                  href={getExplorerUrl('address', selectedToken.mint, cluster)}
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="explorer-link"
                >
                  View on Explorer
                </a>
              </div>
              
              {selectedPool && !selectedPool.isPending && !selectedPool.isPlaceholder ? (
                <PoolManagementTabs
                  selectedToken={selectedToken}
                  selectedPool={selectedPool}
                  handleSubmit={handleSubmit}
                  loading={loading}
                  liquidityForm={liquidityForm}
                  withdrawForm={withdrawForm}
                  swapForm={swapForm}
                  handleChange={handleChange}
                  connected={connected}
                />
              ) : (
                <div className="create-pool-prompt">
                  <h3>No Pool Found</h3>
                  <p>This token doesn't have a liquidity pool yet.</p>
                  <button 
                    className="action-button primary"
                    onClick={() => navigate('/create-pool')}
                  >
                    Create Pool
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      
      {/* Result Display */}
      {result && (
        <div className="result-panel">
          <div className="result-header">
            <h3>Transaction Result</h3>
            <button className="close-button" onClick={() => setResult(null)}>×</button>
          </div>
          <pre className="result-data">{JSON.stringify(result, null, 2)}</pre>
          {result.txId && (
            <a 
              href={getExplorerUrl('tx', result.txId, cluster)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="explorer-link"
            >
              View Transaction on Solana Explorer
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default Home;