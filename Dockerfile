# Use Playwright official image with all dependencies
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for caching
COPY package*.json ./

# Install all dependencies including devDependencies (ts-node/typescript)
RUN npm ci

# Copy the source code
COPY . .

# If you have a build script, use npx tsc to build
RUN npx tsc

# Use Node to run the compiled JS
CMD ["node", "dist/index.js"]
