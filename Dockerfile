# Change from v1.41.0 to v1.57.0
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

RUN npm run build

CMD ["node", "dist/index.js"]