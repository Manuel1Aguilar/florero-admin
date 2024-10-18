# Florero admin


## Task List
Ordered List of Tasks
1. Initial Setup and Repository Creation
Create GitHub Repository:

Create a new repository on GitHub named something like flower-pot-configurator.
Clone the repository to your local machine.
Initialize Node Project:

Navigate to the project folder and initialize it:
sh
Copy code
npm init -y
Install necessary dependencies:
sh
Copy code
npm install express sqlite3 htmx ejs
Install nodemon for development (optional but helpful):
sh
Copy code
npm install -D nodemon
2. Directory Structure and Project Setup
Set Up Directory Structure:

Create the necessary folders:
scss
Copy code
flower-pot-configurator/
├── public/ (static assets like CSS)
├── views/ (EJS templates for the pages)
├── db/ (for the SQLite database file)
├── routes/ (for organizing different routes)
├── server.js (main entry point)
└── README.md
Set Up Express Server:

Create a server.js file to set up an Express server.
Configure the server to use EJS for templating and serve htmx and static files.
js
Copy code
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
3. Database Setup
Create SQLite Database:
Create an SQLite database file in the db folder called database.sqlite.
Define a script (db/init.sql) for creating the tables:
sql
Copy code
CREATE TABLE colors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  hex_code TEXT NOT NULL,
  stock INTEGER NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  order_code TEXT NOT NULL,
  color_spec TEXT NOT NULL,
  status TEXT DEFAULT 'Pending'
);
Add a script in server.js or a separate Node script (dbSetup.js) to initialize the database tables if they don't exist.
4. Routes and Core Logic
Set Up Routes Directory:

Create a routes folder and set up separate route files:
clientRoutes.js for client-side interactions.
adminRoutes.js for admin-side functionality.
Client Page Implementation (MVP):

Client Form Page:

Create a GET route (/) to serve the client customization page using EJS.
EJS Template (views/client.ejs) should contain:
Text-based selection for 25 parts.
Each part can be assigned a color (listed from the available colors in the database).
A "Save Order" button.
Save Order Logic:

POST route (/save-order) to save the client's selection in the database.
Generate an order_code and save it along with the client's name.
Confirmation Page:

Show a confirmation message with the order_code after successfully saving an order.
Admin Page Implementation:

Admin Authentication:

Implement a very basic password-protected admin page.
Store a hardcoded password in an environment variable (dotenv) and require it for access.
Manage Stock:

GET route (/admin/manage-stock) to render a stock management page.
EJS Template (views/manage-stock.ejs) to list all colors and provide input fields for updating stock.
POST route (/admin/update-stock) to handle stock updates.
Manage Orders:

GET route (/admin/manage-orders) to show a list of orders.
EJS Template (views/manage-orders.ejs) to display all orders, with options to confirm or deny each one.
POST route (/admin/confirm-order) and /admin/deny-order to change the status of each order.
5. HTMX Integration
Enhance Dynamic Interaction Using HTMX:
Replace form submissions with HTMX actions for a smoother experience.
Add hx-get and hx-post attributes to the client page to load color options and update part colors dynamically.
Implement AJAX-like interactions without using custom JavaScript.
6. Styling and User Experience
Basic CSS Styling:

Add basic styles to the pages.
Use Bootstrap or custom CSS to make the pages more user-friendly and responsive.
Client Page SVG Enhancement (Post-MVP):

Replace the text representation of parts with an SVG flower pot.
Bind each part of the SVG to a dropdown selection so that users can see the parts change color in real-time.
7. Testing and Debugging
Test All Functionalities:
Test client order creation and validation.
Test admin functionalities for stock updates and order confirmation.
Test the login for the admin page to ensure it's secure.
8. Deployment
Prepare for Deployment:

Create a .env file and set environment variables (like the admin password and port).
Update database paths if necessary.
Host the Application:

Choose a hosting provider like Heroku, Railway, or Render.
Deploy the code using Git:
sh
Copy code
git push heroku main
Set up the environment variables (e.g., admin password) in the hosting provider’s dashboard.
Database Considerations:

Make sure to include the SQLite database or initialize it on deployment.
Use persistent storage if deploying with Heroku to ensure data isn't lost between restarts.
9. Post-Deployment Updates
Client Page Enhancement with SVG:

Update the front-end to replace text parts with a dynamic SVG representation.
Use HTMX to update the SVG colors in real-time based on the user’s selections.
Further Optimizations:

Improve admin page usability.
Add more comprehensive order filtering/searching capabilities.
