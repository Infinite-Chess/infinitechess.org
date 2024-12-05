# adapted from https://www.docker.com/blog/getting-started-with-docker-using-node-jspart-i/
FROM node:22-alpine
 
WORKDIR /usr/app
COPY ./ /usr/app
RUN npm install
 
CMD [ "npx", "nodemon" ]
