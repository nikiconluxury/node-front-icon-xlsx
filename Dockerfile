# Use the official Node.js 18 image.
# https://hub.docker.com/_/node
FROM node:18-slim

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json AND package-lock.json are copied.
# Copying this separately prevents re-running npm install on every code change.
COPY package*.json ./

# Install production dependencies.
# Consider using `npm ci` which is more suitable for production builds as it installs directly from package-lock.json
RUN npm ci --only=production

# Copy local code to the container image.
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Run the web service on container startup.
CMD [ "node", "server.js" ]
