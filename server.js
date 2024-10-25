import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import dotenv from 'dotenv';
import clientRoutes from './routes/clientRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import serveStatic from 'serve-static';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Determine __dirname since it is not available in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));

// Serve the media folder
app.use('/media', express.static(process.env.MEDIA_UPLOAD_PATH));

// Set up session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'defaultsecret',
  resave: false,
  saveUninitialized: true,
}));

// Set view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const staticPath = path.join(process.cwd(), 'public');
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Use serveStatic with the specified root path
app.use('/css', serveStatic(staticPath));
// Use serveStatic with the specified root path
app.use('/assets', serveStatic(staticPath));

// Authentication middleware
app.use((req, res, next) => {
  res.locals.authenticated = req.session?.authenticated || false;
  next();
});

// Use routes

app.use('/', clientRoutes);
app.use('/', adminRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

