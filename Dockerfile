FROM mcr.microsoft.com/playwright:v1.41.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci


# Install TypeScript globally
RUN npm install -g typescript

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Run compiled JS
CMD ["node", "dist/index.js"]
