import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'florero.sqlite');

const getDatabaseConnection = () => {
  const db = new sqlite3.Database(DATABASE_FILE, (err) => {
    if (err) {
      console.log(`DB Path: ${DATABASE_FILE}`);
      console.error('Failed to connect to the SQLite database', err);
    }
  });
  return db;
};

// Home page render
router.get('/', (_, res) => {
    res.render('home');
});
// Client Page - Render customization form
router.get('/client', (_, res) => {
    const db = getDatabaseConnection();
    db.all('SELECT * FROM colors WHERE stock > 0 AND deleted = 0', [], (err, colors) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error fetching colors');
        } else {
            res.render('client', { colors });
        }
    });
});

// Save order - Handle submission
router.post('/save-order', (req, res) => {
    const db = getDatabaseConnection();

    const { client_name, color_spec } = req.body;

    let colorSpecString = '';

    if (Array.isArray(color_spec)) {
        colorSpecString = color_spec.join('');
    } else {
        colorSpecString = color_spec;
    }

    const order_code = Math.random().toString(36).substring(2, 9).toUpperCase();

    const query = `INSERT INTO orders (client_name, order_code, color_spec) VALUES (?, ?, ?);`;
    db.run(query, [client_name, order_code, colorSpecString], function (err) {
        if (err) {
            console.error(err);
            res.status(500).send('Error saving order.');
        } else {
            res.render('order_confirmation', { client_name, order_code });
        }
    });
});

export default router;
