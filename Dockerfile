FROM mcr.microsoft.com/playwright:v1.41.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript if needed
RUN npm run build || true

# Run the application
CMD ["node", "index.ts"]