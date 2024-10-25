import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

const storage = multer.diskStorage({
    destination: (_, __, cb) => {
        cb(null, process.env.MEDIA_UPLOAD_PATH);
    },
    filename: (_, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif|mp4/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  }
});


const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATABASE_FILE = process.env.DATABASE_FILE || path.join(__dirname, 'data', 'florero.sqlite');

const getDatabaseConnection = () => {
  const db = new sqlite3.Database(DATABASE_FILE, (err) => {
    if (err) {
      console.error('Failed to connect to the SQLite database', err);
    }
  });
  return db;
};

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
  const db = getDatabaseConnection();
  db.all('SELECT * FROM colors WHERE deleted = 0', [], (err, colors) => {
    if (err) {
      console.error('Error fetching stock data', err);
      res.status(500).send('Error fetching stock data');
    } else {
      res.render('manage-stock', { colors, authenticated: true });
    }
    db.close();
  });
});

// Update stock - Handle stock updates or create new color
router.post('/admin/update-stock', isAuthenticated, (req, res) => {
  const db = getDatabaseConnection();
  const { color_id, cName, cKey, hex_code, new_stock } = req.body;

  if (color_id) {
    // Update existing color stock
    const updateQuery = `UPDATE colors SET stock = ? WHERE id = ?`;
    db.run(updateQuery, [new_stock, color_id], function (err) {
      if (err) {
        console.error('Error updating color', err);
        res.status(500).send('Error updating color');
      } else {
        db.get('SELECT * FROM colors WHERE id = ?', [color_id], (err, updatedColor) => {
          if (err) {
            console.error('Error fetching updated color', err);
            res.status(500).send('Error fetching updated color');
          } else {
            res.render('partial/color_row', { color: updatedColor }, (err, html) => {
              if (err) {
                console.error('Error rendering updated row', err);
                res.status(500).send('Error rendering updated row');
              } else {
                res.send(html);
              }
            });
          }
          db.close();
        });
      }
    });
  } else {
    const checkQuery = `SELECT * FROM colors WHERE (cName = ? OR cKey = ?) AND deleted = 0`;
    db.get(checkQuery, [cName, cKey], (err, existingColor) => {
      if (err) {
        console.error('Error checking existing color', err);
        res.status(500).send('Error checking existing color');
        db.close();
      } else if (existingColor) {
        res.status(400).send('El color ya existe');
        db.close();
      } else {
        // Insert new color
        const insertQuery = `INSERT INTO colors (cName, cKey, hex_code, stock) VALUES (?, ?, ?, ?)`;
        db.run(insertQuery, [cName, cKey, hex_code, new_stock], function (err) {
          if (err) {
            console.error('Error adding new color', err);
            res.status(500).send('Error adding new color');
          } else {
            const newColorId = this.lastID;
            db.get('SELECT * FROM colors WHERE id = ?', [newColorId], (err, newColor) => {
              if (err) {
                console.error('Error fetching new color', err);
                res.status(500).send('Error fetching new color');
              } else {
                res.render('partial/color_row', { color: newColor }, (err, html) => {
                  if (err) {
                    console.error('Error rendering new color row', err);
                    res.status(500).send('Error rendering new color row');
                  } else {
                    res.send(html);
                  }
                });
              }
              db.close();
            });
          }
        });
      }
    });
  }
});

// Admin page - Manage Orders 
router.get('/admin/manage-orders', isAuthenticated, (_, res) => {
  const db = getDatabaseConnection();
  db.all('SELECT * FROM orders', [], (err, orders) => {
    if (err) {
      console.error('Error fetching orders', err);
      res.status(500).send('Error fetching orders');
    } else {
      res.render('manage-orders', { orders, authenticated: true });
    }
    db.close();
  });
});

// Confirm Order - Handle order confirmation and update stock
router.post('/admin/confirm-order', isAuthenticated, (req, res) => {
  const db = getDatabaseConnection();
  const { order_id } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('Error starting transaction', err);
        return res.status(500).send('Error starting transaction.');
      }

      // Fetch order details
      db.get('SELECT * FROM orders WHERE id = ?', [order_id], (err, order) => {
        if (err || !order) {
          console.error('Error fetching order details', err);
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
                console.error(`Error updating stock for color ${cKey}`, err);
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
                console.error('Error confirming order', err);
                db.run('ROLLBACK', () => {
                  return res.status(500).send('Error confirming order');
                });
              } else {
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    console.error('Error committing transaction', commitErr);
                    return res.status(500).send('Error committing transaction.');
                  }
                });
                // Fetch the updated order details after commit
                db.get('SELECT * FROM orders WHERE id = ?', [order_id], (err, updatedOrder) => {
                  if (err) {
                    console.error('Error fetching updated order after commit', err);
                    return res.status(500).send('Error fetching updated order after commit.');
                  }

                  // Render the updated row after the transaction has successfully committed
                  res.render('partial/order_row', { order: updatedOrder }, (err, html) => {
                    if (err) {
                      console.error('Error rendering order row', err);
                      res.status(500).send('Error rendering order row.');
                    } else {
                      res.send(html);
                    }
                  });
                });
              }
              db.close();
            });
          })
          .catch((error) => {
            console.error('Error during stock update', error);
            db.run('ROLLBACK', () => {
              res.status(500).send(error);
            });
            db.close();
          });
      });
    });
  });
});

// Deny order - Handle order denial
router.post('/admin/deny-order', isAuthenticated, (req, res) => {
    const db = getDatabaseConnection();
    const { order_id } = req.body;
    const query = `UPDATE orders SET status = 'DENIED', date_closed = datetime('now') WHERE id = ?`;
    db.run(query, [order_id], function(err) {
        if (err) {
            console.log(err);
            res.status(500).send('Error denying order');
        } else {
            db.get('SELECT * FROM orders WHERE id = ?', [order_id], (err, order) => {
                if (err || !order) {
                    console.error(`Error fetching order with id: ${order_id},\n Error: ${err}`);
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
// Serve the add media form
router.get('/admin/add-media-form', (_, res) => {
    res.render('partial/add-media-form');
});
// Delete stock - Handle deletion of a color
router.post('/admin/delete-color', isAuthenticated, (req, res) => {
    const db = getDatabaseConnection();
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
// View Order - Render the order details view
router.get('/view-order/:orderCode', (req, res) => {
    const db = getDatabaseConnection();
    const { orderCode } = req.params;

    db.get('SELECT * FROM orders WHERE order_code = ?', [orderCode], (err, order) => {
        if (err) {
            console.log(err);
            return res.status(500).send('Error fetching order details.');
        }
        if (!order) {
            return res.status(404).send('Order not found.');
        }

        const stockComparison = {};
        if (order.status === 'Pending') {
            // Fetch current stock and calculate updated stock after confirmation
            const colorSpec = order.color_spec;
            const colorCounts = {};

            for (const cKey of colorSpec) {
                colorCounts[cKey] = (colorCounts[cKey] || 0) + 1;
            }

            const colorKeys = Object.keys(colorCounts);

            db.all('SELECT * FROM colors WHERE cKey IN (' + colorKeys.map(() => '?').join(',') + ')', colorKeys, (err, colors) => {
                if (err) {
                    console.log(err);
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

                res.render('order_detail', { order, stockComparison, authenticated: req.session.authenticated });
            });
        } else {
            res.render('order_detail', { order, stockComparison, authenticated: req.session.authenticated });
        }
    });
});

// Delete order - Handle deletion of an order
router.post('/admin/delete-order', isAuthenticated, (req, res) => {
    const db = getDatabaseConnection();
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

router.get('/admin/order-colors/:orderId', (req, res) => {
  const db = getDatabaseConnection();
  const orderId = req.params.orderId;

  // First, get the color_spec for the given order ID
  db.get('SELECT color_spec FROM orders WHERE id = ?', [orderId], (err, row) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row) {
      console.log("Order not found");
      return res.status(404).json({ error: 'Order not found' });
    }

    const colorSpec = row.color_spec; // e.g., 'NNNYYRR'
    const colorKeys = colorSpec.split(''); // Split to get individual color keys

    // Use the IN clause to get all hex codes for the given color keys
    const placeholders = colorKeys.map(() => '?').join(',');
    const sql = `SELECT cKey, hex_code FROM colors WHERE cKey IN (${placeholders})`;

    db.all(sql, colorKeys, (err, colors) => {
      if (err) {
        console.log(err);
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

router.get('/admin/manage-media', isAuthenticated, (_, res) => {
    const db = getDatabaseConnection();

    const selectQuery = `SELECT * FROM media`;
    db.all(selectQuery, (err, mediaList) => {
        if (err) {
            console.error(`Error getting media: ${err}`);
            return res.status(500).json({ message: 'Error getting media' });
        } else {
            res.render('partial/manage-media', { mediaList, authenticated: true });
        }
        db.close();
    });
});
    
router.post('/admin/add-media', upload.single('media'), (req, res) => {
    const { description, type } = req.body;

    // Check if req.file exists (ensure the file was uploaded successfully)
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const mediaPath = `/media/${req.file.filename}`;
    const db = getDatabaseConnection();

    const insertQuery = `INSERT INTO media(path, type, description) VALUES (?, ?, ?)`;
    
    db.run(insertQuery, [mediaPath, type, description], function (error) {
        if (error) {
            console.error(`Error inserting media: ${error}`);
            return res.status(500).json({ error: 'Database error' });
        }

        // After the insertion, fetch the new media row by ID (this.lastID gives the inserted row ID)
        const newMediaId = this.lastID;

        db.get('SELECT * FROM media WHERE id = ?', [newMediaId], (err, newMedia) => {
            if (err) {
                console.error(`Error fetching new media: ${err}`);
                return res.status(500).json({ error: 'Error fetching new media' });
            }

            // Render the media_row partial with the new media data
            res.render('partial/media_row', { media: newMedia }, (err, html) => {
                if (err) {
                    console.error(`Error rendering media row: ${err}`);
                    return res.status(500).json({ error: 'Error rendering media row' });
                }

                // Return the rendered partial HTML
                res.send(html);
            });
        });
    });
});


router.post('/admin/delete-media/', async (req, res) => {
    const { media_id } = req.body;

    const db = getDatabaseConnection();

    db.all(`SELECT * FROM media WHERE id = ?`, [ media_id ], (err, media) => {
        if (err) {
            console.error(`Error getting media: ${err}`);
            return res.status(500).json({ error: `Database error` });
        }
        if (!media) {
            return res.status(500).json({ error: `Media not found` });
        }
        const mediaPath = path.join(process.env.MEDIA_UPLOAD_PATH, path.basename(media[0].path));

        fs.unlink(mediaPath, (err) => {
            if (err) {
                console.error(`Error unlinking file: ${err}`);
                return res.status(500).json({ message: 'Error deleting media file' });
            } else {
                const deleteQuery = `DElETE FROM media WHERE id = ?`;
                db.run(deleteQuery, [ media_id ], (err) => {
                    if (err) {
                        console.error(`Error deleting row ${id}: ${err}`);
                        return res.status(500).json({ message: 'Error deleting media row' });
                    } else {
                        res.send('');
                    }
                });
            }
        });

    });
});

export default router;
