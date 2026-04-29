FROM node:20-alpine

# Install Perl (required by exiftool-vendored's bundled ExifTool binary)
RUN apk add --no-cache perl

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

# Create processing directory
RUN mkdir -p /processing

CMD ["node", "worker.js"]
