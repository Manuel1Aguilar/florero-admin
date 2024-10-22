# Step 1: Use an official Node.js image as the base
FROM node:20

# Step 2: Set the working directory in the container
WORKDIR /app

# Step 3: Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of the application code
COPY . .

# Step 6: Expose the port your app runs on
EXPOSE 3000

# Step 7: Command to check for the DB and start the application
CMD ["/bin/sh", "-c", "[ ! -f /app/data/florero.sqlite ] && npm run setup-db; npm start"]

