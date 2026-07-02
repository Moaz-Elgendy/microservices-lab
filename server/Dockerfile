FROM node:lts-alpine

WORKDIR /app

COPY package*.json .

RUN npm install

COPY . .

USER node

EXPOSE 5000

CMD ["npm", "run", "start"]