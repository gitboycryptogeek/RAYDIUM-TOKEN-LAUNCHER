import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const PendingPoolManagement = ({ token, onPoolCreated }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [poolForm, setPoolForm] = useState({
    baseAmount: token ? (token.balance * 0.1).toString() : '100000',
    quoteAmount: '1', // SOL
    lotSize: '0.01',
    tickSize: '0.0001'
  });
  
  const handleChange = (field, value) => {
    setPoolForm(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const handleCreateMarket = async () => {
    if (!token) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // Native SOL mint address
      const solMint = 'So11111111111111111111111111111111111111112';
      
      // Step 1: Create market
      const marketResponse = await axios.post(`${API_URL}/market/create`, {
        baseMint: token.mint,
        quoteMint: solMint,
        lotSize: parseFloat(poolForm.lotSize),
        tickSize: parseFloat(poolForm.tickSize)
      });
      
      setSuccess(`Market created successfully! Market ID: ${marketResponse.data.marketId}`);
      
      // Step 2: Create pool with the market
      try {
        const poolResponse = await axios.post(`${API_URL}/pool/create`, {
          marketId: marketResponse.data.marketId,
          baseAmount: parseFloat(poolForm.baseAmount),
          quoteAmount: parseFloat(poolForm.quoteAmount)
        });
        
        setSuccess(`Pool created successfully with ${poolForm.baseAmount} ${token.symbol || 'tokens'} and ${poolForm.quoteAmount} SOL!`);
        
        // Notify parent component that pool was created
        if (onPoolCreated && typeof onPoolCreated === 'function') {
          onPoolCreated(poolResponse.data);
        }
      } catch (poolError) {
        setError(`Market created but pool creation failed: ${poolError.response?.data?.error || poolError.message}`);
      }
    } catch (marketError) {
      setError(`Market creation failed: ${marketError.response?.data?.error || marketError.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Calculate estimated price
  const estimatedPrice = parseFloat(poolForm.quoteAmount) / parseFloat(poolForm.baseAmount);
  
  return (
    <div className="pending-pool-container">
      <div className="pool-creation-header">
        <h3>Create Pool for {token?.symbol || 'Token'}</h3>
        <p>This token doesn't have a liquidity pool yet. Create one to enable swapping and liquidity provision.</p>
      </div>
      
      {error && <div className="error-container">{error}</div>}
      {success && <div className="success-container">{success}</div>}
      
      <div className="form-group">
        <label>Token Amount:</label>
        <input
          type="number"
          value={poolForm.baseAmount}
          onChange={(e) => handleChange('baseAmount', e.target.value)}
          min="1"
          step="1"
        />
        <small>Amount of {token?.symbol || 'tokens'} to add to the pool</small>
      </div>
      
      <div className="form-group">
        <label>SOL Amount:</label>
        <input
          type="number"
          value={poolForm.quoteAmount}
          onChange={(e) => handleChange('quoteAmount', e.target.value)}
          min="0.001"
          step="0.001"
        />
        <small>Amount of SOL to add to the pool</small>
      </div>
      
      <div className="advanced-settings">
        <details>
          <summary>Advanced Settings</summary>
          
          <div className="form-group">
            <label>Lot Size:</label>
            <input
              type="number"
              value={poolForm.lotSize}
              onChange={(e) => handleChange('lotSize', e.target.value)}
              min="0.0001"
              step="0.0001"
            />
            <small>Minimum tradable token amount</small>
          </div>
          
          <div className="form-group">
            <label>Tick Size:</label>
            <input
              type="number"
              value={poolForm.tickSize}
              onChange={(e) => handleChange('tickSize', e.target.value)}
              min="0.0001"
              step="0.0001"
            />
            <small>Minimum price increment</small>
          </div>
        </details>
      </div>
      
      <div className="price-preview">
        <h4>Initial Price Preview</h4>
        <p>
          <strong>Initial Price:</strong> {estimatedPrice.toFixed(9)} SOL per {token?.symbol || 'token'}
        </p>
        <small>Price is calculated as: [SOL amount] ÷ [Token amount]</small>
      </div>
      
      <button
        onClick={handleCreateMarket}
        disabled={loading || !token}
        className="submit-btn"
      >
        {loading ? 'Creating...' : 'Create Market & Pool'}
      </button>
    </div>
  );
};

export default PendingPoolManagement;