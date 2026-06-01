FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN apk add --no-cache perl
RUN npm install

COPY . .

EXPOSE 4001

CMD [ "npm", "start" ]
