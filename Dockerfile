# Use Playwright official image with all dependencies
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for caching
COPY package*.json ./

# Install ALL dependencies including devDependencies
RUN npm ci --include=dev

# Copy the source code
COPY . .

# Build TypeScript
RUN npm run build

# Use Node to run the compiled JS
CMD ["node", "dist/index.js"]