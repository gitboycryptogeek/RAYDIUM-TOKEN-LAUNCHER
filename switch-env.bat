@echo off
IF "%1"=="devnet" (
    echo Switching to DEVNET mode...
    copy /Y .env.devnet .env
    echo Environment set to DEVNET mode
) ELSE IF "%1"=="mainnet" (
    echo Switching to MAINNET mode...
    copy /Y .env.mainnet .env
    echo Environment set to MAINNET mode
) ELSE (
    echo Usage: switch-env.bat [devnet^|mainnet]
)