FROM node:22-alpine
 
WORKDIR /usr/app
COPY ./ /usr/app
RUN npm install
 
CMD [ "npx", "nodemon" ]
