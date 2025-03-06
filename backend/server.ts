import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  createPool, 
  addLiquidity, 
  removeLiquidity, 
  swap, 
  getPoolInfo,
  getUserTokens,
  createTokenWithPool,
  getPoolsByToken,
  getUserPools,
  createPlaceholderPool,
  readPoolsData,
  writePoolsData
} from './raydium';
import { createToken, getTokenBalance, getTokenMetadata } from './token';
import { keypair, CLUSTER, connection } from './config';
import RateLimit from 'express-rate-limit';
import { requestAirdrop } from './config';
import { PublicKey, Keypair } from '@solana/web3.js';

// Add type definition for Telegram User
declare global {
  namespace Express {
    interface Request {
      telegramUser?: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
        language_code?: string;
      };
    }
  }
}

// Add error handling utility function
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Create Express app
const app = express();
app.set('trust proxy', 1); // Trust first proxy
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads (for token images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req: Express.Request, file: any, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rate limiting
const apiLimiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Create directory for wallet data
const WALLETS_DIR = path.join(__dirname, '../data/wallets');
if (!fs.existsSync(WALLETS_DIR)) {
  fs.mkdirSync(WALLETS_DIR, { recursive: true });
}

// Telegram authentication validation function
function validateTelegramWebAppData(initData: string, botToken: string): boolean {
  try {
    // Parse the data
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return false;
    }
    
    // Remove the hash from the data before checking the signature
    urlParams.delete('hash');
    
    // Sort the params alphabetically as per Telegram docs
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Generate the secret key using the bot token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    // Calculate the hash of the data string
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    // Check if the calculated hash matches the provided hash
    return calculatedHash === hash;
  } catch (error) {
    console.error('Error validating Telegram data:', error);
    return false;
  }
}

// Add Telegram authentication middleware
const telegramAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip validation in development mode or for health check endpoints
  if (process.env.NODE_ENV === 'development' || req.path === '/health') {
    // For development/testing, you can add a mock user
    req.telegramUser = {
      id: 12345678,
      first_name: 'Test',
      username: 'test_user'
    };
    return next();
  }
  
  try {
    const telegramInitData = req.headers['x-telegram-init-data'] as string;
    
    if (!telegramInitData) {
      return res.status(401).json({ error: 'Unauthorized: Missing Telegram data' });
    }
    
    // Bot token provided by BotFather
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    // Validate the data
    const isValid = validateTelegramWebAppData(telegramInitData, botToken);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Telegram data' });
    }
    
    // Extract user data from the initData
    const urlParams = new URLSearchParams(telegramInitData);
    const userJson = urlParams.get('user');
    
    if (!userJson) {
      return res.status(401).json({ error: 'Unauthorized: User data not found' });
    }
    
    // Parse user data
    const userData = JSON.parse(userJson);
    req.telegramUser = userData;
    
    next();
  } catch (error) {
    console.error('Telegram auth validation error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid Telegram data' });
  }
};

// API Routes

// Wallet info
app.get('/api/wallet', async (req: Request, res: Response) => {
  try {
    const userWallet = req.query.publicKey as string;
    
    if (!userWallet) {
      return res.status(400).json({ 
        error: 'Connected wallet public key is required',
        isConnected: false
      });
    }
    
    try {
      const publicKey = new PublicKey(userWallet);
      const balance = await connection.getBalance(publicKey);
      
      res.json({
        publicKey: userWallet,
        cluster: CLUSTER,
        balance: balance / 1e9 // Convert lamports to SOL
      });
    } catch (error) {
      console.error('Error getting balance for connected wallet:', error);
      res.status(400).json({ 
        error: 'Invalid wallet public key'
      });
    }
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Token Operations
app.post('/api/token/create', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { name, symbol, description, decimals, initialSupply } = req.body;
    
    // Validate inputs
    if (!name || !symbol) {
      return res.status(400).json({ error: 'Token name and symbol are required' });
    }
    
    // Get image buffer if it exists
    const image = req.file ? req.file.buffer : undefined;
    
    const result = await createToken({
      name,
      symbol,
      description,
      decimals: parseInt(decimals) || 9,
      initialSupply: parseInt(initialSupply) || 1000000000,
      image
    });
    
    // Create a placeholder pool for the token
    // This allows the UI to show the token even without a real pool
    try {
      await createPlaceholderPool(result);
    } catch (placeholderError) {
      console.warn('Could not create placeholder pool:', placeholderError);
      // Continue anyway, this is not critical
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Create token with market and pool in one operation
app.post('/api/token/create-with-pool', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      symbol, 
      description, 
      decimals, 
      initialSupply, 
      initialLiquidity,
      percentage 
    } = req.body;
    
    console.log('Received request to create token with pool:');
    console.log({ name, symbol, decimals, initialSupply, initialLiquidity, percentage });
    
    // Validate inputs
    if (!name || !symbol) {
      return res.status(400).json({ error: 'Token name and symbol are required' });
    }
    
    // Parse numeric values with fallbacks
    const parsedDecimals = parseInt(decimals) || 9;
    const parsedSupply = parseInt(initialSupply) || 1000000000;
    const parsedLiquidity = parseFloat(initialLiquidity) || 1;
    const poolPercentage = parseFloat(percentage) || 10;
    
    // Get image buffer if it exists
    const image = req.file ? req.file.buffer : undefined;
    
    try {
      // Step 1: Create the token
      console.log(`Creating token: ${name} (${symbol})`);
      const tokenResult = await createToken({
        name,
        symbol,
        description,
        decimals: parsedDecimals,
        initialSupply: parsedSupply,
        image
      });
      
      console.log('Token created:', tokenResult);
      
      try {
        // Wait a moment to ensure the token is properly registered on the blockchain
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 2: Create CPMM pool directly (no market needed)
        console.log(`Creating pool with ${parsedLiquidity} SOL for token ${tokenResult.mint}`);
        const result = await createTokenWithPool(tokenResult, parsedLiquidity);
        
        console.log('Pool creation result:', result);
        
        // Return successful result
        return res.json(result);
      } catch (poolError) {
        console.error('Error creating CPMM pool:', poolError);
        
        // Create a placeholder pool and return the token
        try {
          const placeholderPool = {
            poolId: `placeholder-${tokenResult.mint.slice(0, 8)}`,
            txId: '',
            type: "CPMM",
            baseMint: tokenResult.mint,
            baseName: tokenResult.name || 'Unknown',
            baseSymbol: tokenResult.symbol || 'UNK',
            baseDecimals: tokenResult.decimals,
            baseAmount: 0,
            quoteMint: 'So11111111111111111111111111111111111111112',
            quoteName: 'Solana',
            quoteSymbol: 'SOL',
            quoteDecimals: 9,
            quoteAmount: 0,
            lpMint: '',
            createdAt: new Date().toISOString(),
            owner: keypair.publicKey.toBase58(),
            initialPrice: 0,
            isPlaceholder: true
          };
          
          // Save placeholder pool to local database
          const pools = readPoolsData();
          pools.push(placeholderPool);
          writePoolsData(pools);
          
          return res.status(202).json({
            ...tokenResult,
            pool: placeholderPool,
            error: CLUSTER === 'devnet' 
              ? 'On devnet, only placeholder pools can be created. For real pools, use mainnet.'
              : 'CPMM Pool creation failed. You can try creating it manually.',
            errorDetails: getErrorMessage(poolError)
          });
        } catch (placeholderError) {
          // Just return the token if placeholder creation also fails
          return res.status(202).json({
            ...tokenResult,
            pool: null,
            error: 'CPMM Pool creation failed. You can create a pool manually.',
            errorDetails: getErrorMessage(poolError)
          });
        }
      }
    } catch (tokenError) {
      console.error('Error creating token:', tokenError);
      return res.status(500).json({ 
        error: getErrorMessage(tokenError),
        step: 'token_creation'
      });
    }
  } catch (error) {
    console.error('Error in token/create-with-pool endpoint:', error);
    return res.status(500).json({ 
      error: getErrorMessage(error),
      step: 'token_creation'
    });
  }
});

app.get('/api/token/balance/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    const owner = req.query.owner as string | undefined;
    
    const result = await getTokenBalance(
      mintAddress,
      owner
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/api/token/metadata/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    const result = await getTokenMetadata(mintAddress);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/api/token/list', async (req: Request, res: Response) => {
  try {
    const owner = req.query.publicKey as string;
    
    if (!owner) {
      return res.status(400).json({ 
        error: 'Wallet public key is required'
      });
    }
    
    const tokens = await getUserTokens(owner);
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});


// Pool Operations
app.post('/api/pool/create', async (req: Request, res: Response) => {
  try {
    const { baseMint, quoteMint, baseAmount, quoteAmount } = req.body;
    
    if (!baseMint || !quoteMint) {
      return res.status(400).json({ error: 'Base mint and quote mint are required' });
    }
    
    if (!baseAmount || !quoteAmount) {
      return res.status(400).json({ error: 'Base amount and quote amount are required' });
    }
    
    const result = await createPool(
      baseMint,
      quoteMint, 
      parseFloat(baseAmount), 
      parseFloat(quoteAmount)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});


app.get('/api/pool/:poolId', async (req: Request, res: Response) => {
  try {
    const { poolId } = req.params;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    const result = await getPoolInfo(poolId);
    
    if (result === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get all pools for a specific token
app.get('/api/pool/token/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    
    if (!mintAddress) {
      return res.status(400).json({ error: 'Mint address is required' });
    }
    
    const pools = await getPoolsByToken(mintAddress);
    res.json(pools);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get all pools created by the user
app.get('/api/pool/list', async (req: Request, res: Response) => {
  try {
    const pools = await getUserPools();
    res.json(pools);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Liquidity Operations
app.post('/api/liquidity/add', async (req: Request, res: Response) => {
  try {
    const { poolId, amount, fixedSide, slippage } = req.body;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    if (amount === undefined) {
      return res.status(400).json({ error: 'Amount is required' });
    }
    
    // Check if pool exists
    const poolInfo = await getPoolInfo(poolId);
    if (poolInfo === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    // Check if it's a placeholder pool
    if (poolInfo.isPlaceholder) {
      return res.status(400).json({ 
        error: 'This is a placeholder pool. You need to create a real pool first.'
      });
    }
    
    const result = await addLiquidity(
      poolId, 
      parseFloat(amount), 
      fixedSide as 'a' | 'b', 
      parseFloat(slippage) || 1
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Remove liquidity from a CPMM pool
app.post('/api/liquidity/remove', async (req: Request, res: Response) => {
  try {
    const { poolId, lpAmount, slippage } = req.body;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    if (lpAmount === undefined) {
      return res.status(400).json({ error: 'LP amount is required' });
    }
    
    // Check if pool exists
    const poolInfo = await getPoolInfo(poolId);
    if (poolInfo === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    // Check if it's a placeholder pool
    if (poolInfo.isPlaceholder) {
      return res.status(400).json({ 
        error: 'This is a placeholder pool. You need to create a real pool first.'
      });
    }
    
    const result = await removeLiquidity(
      poolId, 
      parseFloat(lpAmount), 
      parseFloat(slippage) || 1
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Swap tokens using a CPMM pool
app.post('/api/swap', async (req: Request, res: Response) => {
  try {
    const { poolId, inputMint, amount, fixedSide, slippage } = req.body;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    if (!inputMint) {
      return res.status(400).json({ error: 'Input mint is required' });
    }
    
    if (amount === undefined) {
      return res.status(400).json({ error: 'Amount is required' });
    }
    
    // Check if pool exists
    const poolInfo = await getPoolInfo(poolId);
    if (poolInfo === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    // Check if it's a placeholder pool
    if (poolInfo.isPlaceholder) {
      return res.status(400).json({ 
        error: 'This is a placeholder pool. You need to create a real pool first.'
      });
    }
    
    const result = await swap(
      poolId, 
      inputMint, 
      parseFloat(amount), 
      fixedSide as 'in' | 'out', 
      parseFloat(slippage) || 1
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});


app.post('/api/wallet/airdrop', async (req: Request, res: Response) => {
  try {
    const { publicKey, amount } = req.body;
    
    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required' });
    }
    
    if (CLUSTER !== 'devnet') {
      return res.status(400).json({ error: 'Airdrops only available on devnet' });
    }
    
    const signature = await requestAirdrop(publicKey, parseFloat(amount) || 1);
    
    res.json({
      success: true,
      signature,
      publicKey,
      amount: parseFloat(amount) || 1
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Create placeholder pool for a token
app.post('/api/pool/placeholder', async (req: Request, res: Response) => {
  try {
    const { mint, name, symbol, decimals } = req.body;
    
    if (!mint) {
      return res.status(400).json({ error: 'Token mint address is required' });
    }
    
    const tokenInfo = {
      mint,
      name: name || 'Unknown Token',
      symbol: symbol || 'UNK',
      decimals: parseInt(decimals) || 9,
      initialSupply: 0,
      tokenAccount: ''
    };
    
    const placeholderPool = await createPlaceholderPool(tokenInfo);
    res.json(placeholderPool);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Telegram specific endpoints
// -----------------------------

// Create a wallet for a Telegram user
app.post('/api/wallet/create', async (req: Request, res: Response) => {
  try {
    const { telegramId, telegramUsername } = req.body;
    const userId = telegramId || req.telegramUser?.id;
    
    if (!userId) {
      return res.status(400).json({ error: 'Telegram ID is required' });
    }
    
    // Check if a wallet already exists for this user
    const walletPath = path.join(WALLETS_DIR, `${userId}.json`);
    
    if (fs.existsSync(walletPath)) {
      // Wallet already exists, return its info
      const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
      const publicKey = new PublicKey(walletData.publicKey);
      const balance = await connection.getBalance(publicKey);
      
      return res.json({
        publicKey: walletData.publicKey,
        cluster: CLUSTER,
        balance: balance / 1e9, // Convert lamports to SOL
        isNew: false
      });
    }
    
    // Generate a new keypair for the user
    const newKeypair = Keypair.generate();
    
    // Create wallet data object
    const walletData = {
      telegramId: userId,
      telegramUsername: telegramUsername || req.telegramUser?.username,
      publicKey: newKeypair.publicKey.toBase58(),
      secretKey: Array.from(newKeypair.secretKey),
      createdAt: new Date().toISOString()
    };
    
    // Save wallet data to file
    fs.writeFileSync(walletPath, JSON.stringify(walletData, null, 2));
    
    // Request an initial airdrop for new wallets on devnet
    let initialBalance = 0;
    if (CLUSTER === 'devnet') {
      try {
        await requestAirdrop(newKeypair.publicKey.toBase58(), 1);
        initialBalance = 1;
      } catch (error) {
        console.error('Error requesting initial airdrop for new wallet:', error);
        // Continue anyway, wallet is still created
      }
    }
    
    res.json({
      publicKey: newKeypair.publicKey.toBase58(),
      cluster: CLUSTER,
      balance: initialBalance,
      isNew: true
    });
  } catch (error) {
    console.error('Error creating wallet for Telegram user:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get wallet info for a Telegram user
app.get('/api/wallet/info', async (req: Request, res: Response) => {
  try {
    const telegramId = req.query.telegramId as string;
    const userWallet = req.query.publicKey as string;
    
    // Handle Telegram user wallet info
    if (telegramId) {
      if (!fs.existsSync(path.join(WALLETS_DIR, `${telegramId}.json`))) {
        return res.json(null); // No wallet exists for this user
      }
      
      try {
        const walletData = JSON.parse(fs.readFileSync(path.join(WALLETS_DIR, `${telegramId}.json`), 'utf-8'));
        const publicKey = new PublicKey(walletData.publicKey);
        
        // Get current balance
        const balance = await connection.getBalance(publicKey);
        
        return res.json({
          publicKey: walletData.publicKey,
          cluster: CLUSTER,
          balance: balance / 1e9, // Convert lamports to SOL
          telegramUsername: walletData.telegramUsername
        });
      } catch (error) {
        console.error('Error reading wallet data:', error);
        return res.status(500).json({ error: 'Failed to read wallet data' });
      }
    }
    
    // Handle regular wallet info
    if (userWallet) {
      try {
        const publicKey = new PublicKey(userWallet);
        const balance = await connection.getBalance(publicKey);
        
        return res.json({
          publicKey: userWallet,
          cluster: CLUSTER,
          balance: balance / 1e9, // Convert lamports to SOL
          isConnected: true
        });
      } catch (error) {
        console.error('Error getting balance for connected wallet:', error);
        return res.status(400).json({ 
          error: 'Invalid wallet public key',
          isConnected: false
        });
      }
    }
    
    return res.status(400).json({ 
      error: 'Either telegramId or publicKey is required',
      isConnected: false
    });
  } catch (error) {
    console.error('Error in wallet info endpoint:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: getErrorMessage(err) });
});

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.path}`);
  next();
});

// Serve static files from the React app
const staticPath = path.join(__dirname, '../frontend/build');
console.log(`Static path: ${staticPath}, exists: ${fs.existsSync(staticPath)}`);
app.use(express.static(staticPath));

// For any request that doesn't match an API route or static file, serve the React app
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  console.log(`Serving index.html from: ${indexPath}, exists: ${fs.existsSync(indexPath)}`);
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend build not found. Please check your build configuration.');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
  console.log(`Cluster: ${CLUSTER}`);
  console.log(`Serving static files from: ${staticPath}`);
});