import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Home.css';
import TokenCreationForm from './tokenCreationForm';
import PendingPoolManagement from './pendingPoolManagement';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Helper utility to generate explorer URL based on cluster
const getExplorerUrl = (type, address, cluster) => {
  const baseUrl = 'https://explorer.solana.com';
  const clusterParam = cluster !== 'mainnet' ? `?cluster=${cluster}` : '';
  return `${baseUrl}/${type}/${address}${clusterParam}`;
};

const Home = () => {
  const [walletInfo, setWalletInfo] = useState({ publicKey: '', cluster: '', balance: 0 });
  const [activeTab, setActiveTab] = useState('create');
  const [userTokens, setUserTokens] = useState([]);
  const [userPools, setUserPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [success, setSuccess] = useState('');
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedPool, setSelectedPool] = useState(null);
  
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
  
  // Fetch data on mount
  useEffect(() => {
    fetchWalletInfo();
    fetchUserTokens();
    fetchUserPools();

    // Set up a refresh interval
    const intervalId = setInterval(() => {
      fetchWalletInfo();
      fetchUserTokens();
      fetchUserPools();
    }, 30000); // Refresh every 30 seconds

    // Clear the interval when component unmounts
    return () => clearInterval(intervalId);
  }, []);
  
  // Fetch wallet info
  const fetchWalletInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}/wallet`);
      setWalletInfo(response.data);
    } catch (error) {
      console.error('Error fetching wallet info:', error);
      setError('Failed to fetch wallet information. Make sure your backend server is running.');
    }
  };
  
  // Fetch user tokens
  const fetchUserTokens = async () => {
    try {
      const response = await axios.get(`${API_URL}/token/list`);
      if (response.data && Array.isArray(response.data)) {
        setUserTokens(response.data);
      }
    } catch (error) {
      console.error('Error fetching user tokens:', error);
    }
  };
  
  // Fetch user pools
  const fetchUserPools = async () => {
    try {
      const response = await axios.get(`${API_URL}/pool/list`);
      // Handle the case when the endpoint returns empty data or errors
      if (response.data && Array.isArray(response.data)) {
        setUserPools(response.data);
      } else {
        console.log('No pools data available', response.data);
        setUserPools([]);
      }
    } catch (error) {
      console.error('Error fetching user pools:', error);
      setUserPools([]);
    }
  };
  
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
      isPending: true // Flag to indicate this is not a real pool yet
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
  
  // Handle token creation success
  const handleTokenCreationSuccess = (tokenData) => {
    setResult(tokenData);
    setSuccess(`Token ${tokenData.name} (${tokenData.symbol}) created successfully!`);
    
    // Refresh data
    fetchWalletInfo();
    fetchUserTokens();
    fetchUserPools();
  };
  
  // Handle pool creation success
  const handlePoolCreated = (poolData) => {
    // Update the selected pool
    setSelectedPool(poolData);
    
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
  };
  
  // Handle form submission for liquidity and swap operations
  const handleSubmit = async (formType) => {
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
          
          if (selectedPool.isPending) {
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
            slippage: parseFloat(liquidityForm.slippage)
          };
          
          response = await axios.post(`${API_URL}/liquidity/add`, payload);
          setSuccess('Liquidity added successfully!');
          break;
        }
        case 'removeLiquidity': {
          if (!selectedPool) {
            throw new Error('No pool selected');
          }
          
          if (selectedPool.isPending) {
            throw new Error('This pool is pending creation. Create a pool first.');
          }
          
          const payload = {
            poolId: selectedPool.poolId,
            lpAmount: parseFloat(withdrawForm.lpAmount),
            slippage: parseFloat(withdrawForm.slippage)
          };
          
          response = await axios.post(`${API_URL}/liquidity/remove`, payload);
          setSuccess('Liquidity removed successfully!');
          break;
        }
        case 'swap': {
          if (!selectedPool || !selectedToken) {
            throw new Error('No pool or token selected');
          }
          
          if (selectedPool.isPending) {
            throw new Error('This pool is pending creation. Create a pool first.');
          }
          
          const solMint = 'So11111111111111111111111111111111111111112'; // Native SOL mint
          
          const payload = {
            poolId: selectedPool.poolId,
            inputMint: swapForm.fromToken === 'sol' ? solMint : selectedToken.mint,
            amount: parseFloat(swapForm.amount),
            fixedSide: 'in',
            slippage: parseFloat(swapForm.slippage)
          };
          
          response = await axios.post(`${API_URL}/swap`, payload);
          setSuccess('Swap executed successfully!');
          break;
        }
        default:
          throw new Error('Invalid form type');
      }
      
      setResult(response.data);
      
      // Refresh wallet info, tokens and pools
      fetchWalletInfo();
      fetchUserTokens();
      fetchUserPools();
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
          <p><strong>Wallet:</strong> {walletInfo.publicKey || 'Loading...'}</p>
          <p><strong>Network:</strong> {walletInfo.cluster || 'Loading...'}</p>
          <p><strong>Balance:</strong> {walletInfo.balance !== undefined ? walletInfo.balance.toFixed(4) : 'Loading...'} SOL</p>
        </div>
      </header>
      
      {/* Tokens sidebar */}
      <div className='sidebar'>
        <h3>Your Tokens with Pools</h3>
        {userTokens.length > 0 ? (
          <div className='token-list'>
            {userTokens.map((token) => (
              <div 
                key={token.mint} 
                className={`token-item ${selectedToken?.mint === token.mint ? 'selected' : ''}`}
                onClick={() => handleTokenSelect(token)}
              >
                <p><strong>{token.symbol || `${token.mint.slice(0, 4)}...${token.mint.slice(-4)}`}</strong></p>
                <p>Balance: {token.balance}</p>
                {userPools.some(p => p && (p.baseMint === token.mint || p.quoteMint === token.mint)) && (
                  <p className="pool-badge">Has Pool</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p>No tokens found</p>
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
          <TokenCreationForm onSuccess={handleTokenCreationSuccess} />
        )}
        
        {/* Pending Pool Management */}
        {activeTab === 'manage' && selectedToken && selectedPool && selectedPool.isPending && (
          <PendingPoolManagement 
            token={selectedToken} 
            onPoolCreated={handlePoolCreated} 
          />
        )}
        
        {/* Manage Pool Form (Add/Remove Liquidity, Swap) */}
        {activeTab === 'manage' && selectedToken && selectedPool && !selectedPool.isPending && (
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
                    disabled={loading}
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
                    disabled={loading}
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
                    disabled={loading}
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
                href={getExplorerUrl('tx', result.txId, walletInfo.cluster)} 
                target='_blank' 
                rel='noopener noreferrer'
                className='explorer-link'
              >
                View Transaction on Solana Explorer
              </a>
            )}
            {result.mint && (
              <a 
                href={getExplorerUrl('address', result.mint, walletInfo.cluster)} 
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
                href={getExplorerUrl('address', result.pool.poolId, walletInfo.cluster)} 
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