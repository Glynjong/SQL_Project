# Development and Production Dockerfile for React frontend
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY public ./public
COPY src ./src

# Set CI environment variable to treat warnings as warnings, not errors
ENV CI=false

# Expose port 3000 for development (npm start)
EXPOSE 3000

# Development will use: npm start
# Production will use: npm run build && npx serve -s build
# Default to start (development)
CMD ["npm", "start"]
