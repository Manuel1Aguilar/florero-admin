import sqlite from 'sqlite3';
import fs from 'fs';
import path from 'path'
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();
const sqlite3 = sqlite.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'florero.sqlite');
const initSqlPath = path.join(__dirname, 'init.sql');

// Open or create
const db = new sqlite3.Database(DATABASE_FILE, (err) => {
    if (err) {
        console.log(`DatabaseFile: ${DATABASE_FILE}`);
        console.error('Error opening database: ', err.message);
        return;
    }
});

console.log('Connected to SQLite database.');

fs.readFile(initSqlPath, 'utf-8', (err, sql) => {
    if (err) {
        console.error('Error reading init.sql file: ', err.message);
    }
    
    db.exec(sql, (err) => {
        if (err) {
            console.error('Error executing SQL script: ', err.message);
        } else {
            console.log('Database setup complete.');
        }

        db.close((err) => {
            if (err) {
                console.error('Error closing database: ', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    });
});
