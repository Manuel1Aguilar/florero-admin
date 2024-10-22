import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3  from 'sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../db', 'florero.sqlite');
const db = new sqlite3.Database(dbPath);

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        res.redirect('/admin');
    }
};

router.get('/admin', (req, res) => {
  res.render('admin', { authenticated: req.session.authenticated || false, error: null });
});

// Admin login 
router.post('/admin/login', (req, res) => {
  const { admin_password } = req.body;

  if (admin_password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/admin'); // Redirect to /admin after successful login
  } else {
    res.render('admin', { error: 'Invalid password' }); // Render login page with an error
  }
});

// Admin logout
router.get('/admin/logout', (req, res) => {
    req.session.authenticated = false;
    res.redirect('/');
});

// Admin page - Manage Stock 
router.get('/admin/manage-stock', isAuthenticated, (_, res) => {
    db.all('SELECT * FROM colors WHERE deleted = 0', [], (err, colors) => {
        if (err) {
            res.status(500).send('Error fetching stock data');
        } else {
            res.render('manage-stock', { colors, authenticated: true });
        }
    });
});

// Update stock - Handle stock updates or create new color
router.post('/admin/update-stock', isAuthenticated, (req, res) => {
    const { color_id, cName, cKey, hex_code, new_stock } = req.body;

    if (color_id) {
        // Update existing color stock
        const updateQuery = `UPDATE colors SET stock = ? WHERE id = ?`;
        db.run(updateQuery, [new_stock, color_id], function (err) {
            if (err) {
                console.error(err);
                res.status(500).send('Error updating color');
            } else {
                db.get('SELECT * FROM colors WHERE id = ?', [color_id], (err, updatedColor) => {
                    if (err) {
                        res.status(500).send('Error fetching updated color');
                    } else {
                        res.render('partial/color_row', { color: updatedColor }, (err, html) => {
                            if (err) {
                                res.status(500).send('Error rendering updated row');
                            } else {
                                res.send(html);
                            }
                        });
                    }
                });
            }
        });
    } else {
        const checkQuery = `SELECT * FROM colors WHERE (cName = ? OR cKey = ?) AND deleted = 0`;
        db.get(checkQuery, [cName, cKey], (err, existingColor) => {
            if (err) {
                console.error(err);
                res.status(500).send('Error checking existing color');
            } else if (existingColor) {
                res.status(400).send('El color ya existe');
            } else {
                // Insert new color
                const insertQuery = `INSERT INTO colors (cName, cKey, hex_code, stock) VALUES (?, ?, ?, ?)`;
                db.run(insertQuery, [cName, cKey, hex_code, new_stock], function (err) {
                    if (err) {
                        console.error(err);
                        res.status(500).send('Error adding new color');
                    } else {
                        const newColorId = this.lastID;
                        db.get('SELECT * FROM colors WHERE id = ?', [newColorId], (err, newColor) => {
                            if (err) {
                                res.status(500).send('Error fetching new color');
                            } else {
                                res.render('partial/color_row', { color: newColor }, (err, html) => {
                                    if (err) {
                                        res.status(500).send('Error rendering new color row');
                                    } else {
                                        res.send(html);
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});


// Admin page - Manage Orders 
router.get('/admin/manage-orders', isAuthenticated, (_, res) => {
    db.all('SELECT * FROM orders', [], (err, orders) => {
        if (err) {
            res.status(500).send('Error fetching orders');
        } else {
            res.render('manage-orders', { orders, authenticated: true });
        }
    });
});

// Confirm Order - Handle order confirmation and update stock
router.post('/admin/confirm-order', isAuthenticated, (req, res) => {
    const { order_id } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
                return res.status(500).send('Error starting transaction.');
            }

            // Fetch order details
            db.get('SELECT * FROM orders WHERE id = ?', [order_id], (err, order) => {
                if (err || !order) {
                    db.run('ROLLBACK', () => {
                        return res.status(500).send('Error fetching order details.');
                    });
                    return;
                }

                const colorSpec = order.color_spec;
                const colorCounts = {};

                // Calculate the count of each color in the colorSpec
                for (const cKey of colorSpec) {
                    colorCounts[cKey] = (colorCounts[cKey] || 0) + 1;
                }

                // Update stock for each color
                const updateStockPromises = Object.entries(colorCounts).map(([cKey, count]) => {
                    return new Promise((resolve, reject) => {
                        const updateQuery = `UPDATE colors SET stock = stock - ? WHERE cKey = ? AND stock >= ?`;
                        db.run(updateQuery, [count, cKey, count], function (err) {
                            if (err) {
                                reject(`Error updating stock for color ${cKey}`);
                            } else if (this.changes == 0) {
                                reject(`Insufficient stock for color ${cKey}`);
                            } else {
                                resolve();
                            }
                        });
                    });
                });

                Promise.all(updateStockPromises)
                    .then(() => {
                        // Update order status to Confirmed
                        const confirmQuery = `UPDATE orders SET status = 'Confirmed', date_closed = datetime('now') WHERE id = ?`;
                        db.run(confirmQuery, [order_id], function (err) {
                            if (err) {
                                db.run('ROLLBACK', () => {
                                    return res.status(500).send('Error confirming order');
                                });
                            } else {
                                db.run('COMMIT', (commitErr) => {
                                    if (commitErr) {
                                        return res.status(500).send('Error committing transaction.');
                                    }
                                });
                                // Fetch the updated order details after commit
                                db.get('SELECT * FROM orders WHERE id = ?', [order_id], (err, updatedOrder) => {
                                    if (err) {
                                        return res.status(500).send('Error fetching updated order after commit.');
                                    }

                                    // Render the updated row after the transaction has successfully committed
                                    res.render('partial/order_row', { order: updatedOrder }, (err, html) => {
                                        if (err) {
                                            console.error(err);
                                            res.status(500).send('Error rendering order row.');
                                        } else {
                                            res.send(html);
                                        }
                                    });
                                });
                            }
                        });
                    })
                    .catch((error) => {
                        db.run('ROLLBACK', () => {
                            res.status(500).send(error);
                        });
                    });
            });
        });
    });

});


// Deny order - Handle order denial
router.post('/admin/deny-order', isAuthenticated, (req, res) => {
    const { order_id } = req.body;
    const query = `UPDATE orders SET status = 'DENIED', date_closed = datetime('now') WHERE id = ?`;
    db.run(query, [order_id], function(err) {
        if (err) {
            res.status(500).send('Error denying order');
        } else {
            db.get('SELECT * FROM orders WHERE id = ?', [order_id], (err, order) => {
                if (err || !order) {
                    console.error(`Error fetching order with id: ${order_id}`);
                    res.status(500).send('Error fetching updated order');
                } else {
                    res.render('partial/order_row', { order }, (err, html) => {
                        if (err) {
                            console.error(err);
                            res.status(500).send('Error rendering order row');
                        } else {
                            res.send(html);
                        }
                    });
                }
            });
        }
    });
});

// Serve the add color form
router.get('/admin/add-color-form', (_, res) => {
    res.render('add-color-form');
});

// Delete stock - Handle deletion of a color
router.post('/admin/delete-color', isAuthenticated, (req, res) => {
    const { color_id } = req.body;
    
    if (!color_id) {
        return res.status(400).send('Color ID is required to delete a color item.');
    }

    const deleteQuery = `UPDATE colors SET deleted = 1 WHERE id = ?`;
    db.run(deleteQuery, [color_id], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).send('Error deleting color item');
        }
        
        res.send(''); // Sending an empty response so the row is removed from the page
    });
});

// Delete order - Handle deletion of an order
router.post('/admin/delete-order', isAuthenticated, (req, res) => {
    const { order_id } = req.body;
    
    if (!order_id) {
        return res.status(400).send('Order ID is required to delete an order.');
    }

    const deleteQuery = `DELETE FROM orders WHERE id = ?`;
    db.run(deleteQuery, [order_id], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).send('Error deleting order');
        }
        res.send(''); // Sending an empty response so the row is removed from the page
    });
});

// View Order - Render the order details view
router.get('/admin/view-order/:orderId', isAuthenticated, (req, res) => {
    const { orderId } = req.params;

    db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
        if (err || !order) {
            return res.status(500).send('Error fetching order details.');
        }

        if (order.status === 'Pending') {
            // Fetch current stock and calculate updated stock after confirmation
            const colorSpec = order.color_spec;
            const colorCounts = {};

            for (const cKey of colorSpec) {
                colorCounts[cKey] = (colorCounts[cKey] || 0) + 1;
            }

            const stockComparison = {};
            const colorKeys = Object.keys(colorCounts);

            db.all('SELECT * FROM colors WHERE cKey IN (' + colorKeys.map(() => '?').join(',') + ')', colorKeys, (err, colors) => {
                if (err) {
                    return res.status(500).send('Error fetching stock data.');
                }

                colors.forEach((color) => {
                    const count = colorCounts[color.cKey];
                    stockComparison[color.cKey] = {
                        currentStock: color.stock,
                        count: count,
                        updatedStock: color.stock - count
                    };
                });

                res.render('order_detail', { order, stockComparison, authenticated: true });
            });
        } else {
            res.render('order_detail', { order, stockComparison: null, authenticated: true });
        }
    });
});

router.get('/admin/order-colors/:orderId', (req, res) => {
  const orderId = req.params.orderId;

  // First, get the color_spec for the given order ID
  db.get('SELECT color_spec FROM orders WHERE id = ?', [orderId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const colorSpec = row.color_spec; // e.g., 'NNNYYRR'
    const colorKeys = colorSpec.split(''); // Split to get individual color keys

    // Use the IN clause to get all hex codes for the given color keys
    const placeholders = colorKeys.map(() => '?').join(',');
    const sql = `SELECT cKey, hex_code FROM colors WHERE cKey IN (${placeholders})`;

    db.all(sql, colorKeys, (err, colors) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Create the HTML response by mapping over colorKeys and rendering each div
      const colorBlocks = colorKeys.map((cKey, i) => {
        const color = colors.find(color => color.cKey === cKey);
        const hexCode = color ? color.hex_code : '#ffffff'; // default to white if not found
        return `
          <div id="stack-preview-${i}" class="w-full h-8 md:w-32 border border-gray-400 cursor-pointer" 
               style="background-color: ${hexCode};" data-ckey="${cKey}">
          </div>
        `;
      }).join('');

      res.send(colorBlocks); // Send the HTML back
    });
  });
});

export default router;
