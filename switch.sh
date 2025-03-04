#!/bin/bash

# Simple script to switch between devnet and mainnet modes

case "$1" in
  devnet)
    echo "Switching to DEVNET mode..."
    export SOLANA_CLUSTER=devnet
    docker-compose down
    docker-compose up -d --build
    echo "App is running on http://localhost:3001 in DEVNET mode"
    ;;
  
  mainnet)
    echo "Switching to MAINNET mode..."
    export SOLANA_CLUSTER=mainnet
    
    # Check if we need to switch wallet files
    if [ -f "wallet-mainnet.json" ] && [ ! -f "wallet.json.backup" ]; then
      echo "Backing up devnet wallet and using mainnet wallet..."
      cp wallet.json wallet.json.backup
      cp wallet-mainnet.json wallet.json
    fi
    
    docker-compose down
    docker-compose up -d --build
    echo "App is running on http://localhost:3001 in MAINNET mode"
    ;;
  
  *)
    echo "Usage: ./switch.sh [devnet|mainnet]"
    echo "  devnet  - Run app on Solana devnet"
    echo "  mainnet - Run app on Solana mainnet"
    ;;
esac