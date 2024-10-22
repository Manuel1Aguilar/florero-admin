import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../db', 'florero.sqlite');
const db = new sqlite3.Database(dbPath);
// Home page render
router.get('/', (_, res) => {
    res.render('home');
});
// Client Page - Render customization form
router.get('/client', (_, res) => {
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
