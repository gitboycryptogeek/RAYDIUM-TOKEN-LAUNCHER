import React, { useState, useRef } from 'react';
import axios from 'axios';
import './TokenCreationForm.css'; // You'll need to create this CSS file

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const TokenCreationForm = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tokenForm, setTokenForm] = useState({
    name: '',
    symbol: '',
    description: '',
    decimals: '9',
    initialSupply: '1000000000',
    initialLiquidity: '1', // Default 1 SOL
    percentage: '10', // Default 10% of supply for pool
    image: null
  });

  // Ref for file input
  const fileInputRef = useRef(null);

  // Calculate estimated token price
  const calculateEstimatedPrice = () => {
    const initialSol = parseFloat(tokenForm.initialLiquidity) || 1;
    const initialSupply = parseFloat(tokenForm.initialSupply) || 1000000000;
    const percentage = parseFloat(tokenForm.percentage) || 10;
    
    // Calculate tokens allocated to the pool
    const tokensInPool = initialSupply * (percentage / 100);
    
    // Calculate price per token in SOL
    const pricePerToken = initialSol / tokensInPool;
    
    return {
      tokensInPool,
      pricePerToken
    };
  };
  
  // Estimated price for display
  const estimatedPrice = calculateEstimatedPrice();

  // Handle input changes
  const handleChange = (field, value) => {
    setTokenForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle file input change
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setTokenForm(prev => ({
        ...prev,
        image: e.target.files[0]
      }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // Validate required fields
      if (!tokenForm.name || !tokenForm.symbol) {
        throw new Error('Token name and symbol are required');
      }
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('name', tokenForm.name);
      formData.append('symbol', tokenForm.symbol);
      formData.append('description', tokenForm.description || `${tokenForm.name} Token`);
      formData.append('decimals', tokenForm.decimals);
      formData.append('initialSupply', tokenForm.initialSupply);
      formData.append('initialLiquidity', tokenForm.initialLiquidity);
      formData.append('percentage', tokenForm.percentage);
      
      if (tokenForm.image) {
        formData.append('image', tokenForm.image);
      }
      
      const response = await axios.post(`${API_URL}/token/create-with-pool`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Reset form
      setTokenForm({
        name: '',
        symbol: '',
        description: '',
        decimals: '9',
        initialSupply: '1000000000',
        initialLiquidity: '1',
        percentage: '10',
        image: null
      });
      
      setSuccess(`Token ${response.data.name} (${response.data.symbol}) created with market and pool successfully!`);
      
      // Call the onSuccess callback if provided
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess(response.data);
      }
    } catch (error) {
      console.error('Error creating token:', error);
      setError(error.response?.data?.error || error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="token-form-container">
      <h2>Create Token with SOL Pool</h2>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h3>Token Details</h3>
          
          <div className="form-group">
            <label htmlFor="token-name">Token Name:</label>
            <input
              id="token-name"
              type="text"
              value={tokenForm.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="My Token"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="token-symbol">Token Symbol:</label>
            <input
              id="token-symbol"
              type="text"
              value={tokenForm.symbol}
              onChange={(e) => handleChange('symbol', e.target.value)}
              placeholder="MTK"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="token-description">Description: (Optional)</label>
            <textarea
              id="token-description"
              value={tokenForm.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Description of your token"
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="token-decimals">Decimals:</label>
            <input
              id="token-decimals"
              type="number"
              value={tokenForm.decimals}
              onChange={(e) => handleChange('decimals', e.target.value)}
              min="0"
              max="9"
            />
            <small>Number of decimal places (0-9)</small>
          </div>
          
          <div className="form-group">
            <label htmlFor="token-supply">Initial Supply:</label>
            <input
              id="token-supply"
              type="number"
              value={tokenForm.initialSupply}
              onChange={(e) => handleChange('initialSupply', e.target.value)}
              min="1"
            />
            <small>Total number of tokens to mint</small>
          </div>
          
          <div className="form-group">
            <label htmlFor="token-image">Token Image: (Optional)</label>
            <input
              id="token-image"
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileChange}
            />
            <small>Max size: 5MB</small>
          </div>
        </div>
        
        <div className="form-section">
          <h3>Liquidity Pool Settings</h3>
          
          <div className="form-group">
            <label htmlFor="token-liquidity">Initial SOL Liquidity:</label>
            <input
              id="token-liquidity"
              type="number"
              value={tokenForm.initialLiquidity}
              onChange={(e) => handleChange('initialLiquidity', e.target.value)}
              min="0.1"
              step="0.1"
            />
            <small>Amount of SOL to add to the initial pool</small>
          </div>
          
          <div className="form-group">
            <label htmlFor="token-percentage">
              Percentage of Token Supply for Pool: {tokenForm.percentage}%
            </label>
            <div className="range-container">
              <input
                id="token-percentage"
                type="range"
                min="1"
                max="50"
                value={tokenForm.percentage}
                onChange={(e) => handleChange('percentage', e.target.value)}
                className="range-slider"
              />
              <div className="range-value">{tokenForm.percentage}%</div>
            </div>
            <small>How much of your token supply will be allocated to the pool</small>
          </div>
          
          <div className="price-preview">
            <h4>Initial Price Preview</h4>
            <p>
              <strong>Tokens in Pool:</strong> {estimatedPrice.tokensInPool.toLocaleString()} {tokenForm.symbol || 'tokens'}
            </p>
            <p>
              <strong>Initial Price:</strong> {estimatedPrice.pricePerToken.toFixed(9)} SOL per {tokenForm.symbol || 'token'}
            </p>
            <small>Price is calculated as: [SOL amount] ÷ [Tokens in pool]</small>
          </div>
        </div>
        
        <button 
          type="submit" 
          className="submit-btn" 
          disabled={loading}
        >
          {loading ? 'Creating Token & Pool...' : 'Create Token & Pool'}
        </button>
      </form>
    </div>
  );
};

export default TokenCreationForm;