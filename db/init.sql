CREATE TABLE IF NOT EXISTS colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cName TEXT NOT NULL,
    cKey TEXT NOT NULL,
    hex_code TEXT NOT NULL,
    stock INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    order_code TEXT NOT NULL,
    color_spec TEXT NOT NULL,
    date_closed TEXT,
    status TEXT DEFAULT 'Pending'
);
