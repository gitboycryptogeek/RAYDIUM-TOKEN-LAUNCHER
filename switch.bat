@echo off
IF "%1"=="devnet" (
    echo Switching to DEVNET mode...
    set SOLANA_CLUSTER=devnet
    docker compose down
    docker compose up -d --build
    echo App is running on http://localhost:3001 in DEVNET mode
) ELSE IF "%1"=="mainnet" (
    echo Switching to MAINNET mode...
    set SOLANA_CLUSTER=mainnet
    
    IF EXIST wallet-mainnet.json (
        IF NOT EXIST wallet.json.backup (
            echo Backing up devnet wallet and using mainnet wallet...
            copy wallet.json wallet.json.backup
            copy wallet-mainnet.json wallet.json
        )
    )
    
    docker compose down
    docker compose up -d --build
    echo App is running on http://localhost:3001 in MAINNET mode
) ELSE (
    echo Usage: switch.bat [devnet^|mainnet]
    echo   devnet  - Run app on Solana devnet
    echo   mainnet - Run app on Solana mainnet
)