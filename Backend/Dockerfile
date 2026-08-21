# Development and Production Dockerfile for Node.js backend
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for nodemon)
RUN npm install

# Copy application files
COPY server.js ./

# Expose port 5000
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000', (r) => {if (r.statusCode !== 404) throw new Error(r.statusCode)})"

# Development will use: npm run dev
# Production will use: npm start
# Default to start (for production)
CMD ["npm", "start"]
