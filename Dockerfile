FROM node:18-alpine

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm run install:all

# Copy the rest of the code
COPY . .

# Build the app
RUN npm run build:backend
RUN npm run build:frontend

# Create data directory
RUN mkdir -p data

# Expose the API port
EXPOSE 3001

# Start the server
CMD ["node", "dist/server.js"]