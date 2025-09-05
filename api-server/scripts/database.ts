// @ts-ignore
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'transport.db');

export function initDatabase() {
  const db = new Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      onestop_id TEXT UNIQUE,
      name TEXT,
      spec TEXT,
      last_updated TEXT,
      feed_version_sha1 TEXT
    );

    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER,
      route_id TEXT,
      route_short_name TEXT,
      route_long_name TEXT,
      route_type INTEGER,
      route_color TEXT,
      agency_id TEXT,
      agency_name TEXT,
      geometry TEXT,
      FOREIGN KEY (feed_id) REFERENCES feeds (id)
    );

    CREATE TABLE IF NOT EXISTS stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER,
      stop_id TEXT,
      stop_name TEXT,
      stop_lat REAL,
      stop_lon REAL,
      location_type INTEGER,
      parent_station TEXT,
      FOREIGN KEY (feed_id) REFERENCES feeds (id)
    );

    CREATE TABLE IF NOT EXISTS route_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER,
      stop_id INTEGER,
      feed_id INTEGER,
      FOREIGN KEY (route_id) REFERENCES routes (id),
      FOREIGN KEY (stop_id) REFERENCES stops (id),
      FOREIGN KEY (feed_id) REFERENCES feeds (id)
    );

    CREATE TABLE IF NOT EXISTS departures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stop_id INTEGER,
      route_id INTEGER,
      feed_id INTEGER,
      departure_time TEXT,
      arrival_time TEXT,
      service_date TEXT,
      trip_id TEXT,
      stop_sequence INTEGER,
      FOREIGN KEY (stop_id) REFERENCES stops (id),
      FOREIGN KEY (route_id) REFERENCES routes (id),
      FOREIGN KEY (feed_id) REFERENCES feeds (id)
    );

    CREATE INDEX IF NOT EXISTS idx_routes_feed_id ON routes (feed_id);
    CREATE INDEX IF NOT EXISTS idx_stops_feed_id ON stops (feed_id);
    CREATE INDEX IF NOT EXISTS idx_stops_location ON stops (stop_lat, stop_lon);
    CREATE INDEX IF NOT EXISTS idx_route_stops_stop_id ON route_stops (stop_id);
    CREATE INDEX IF NOT EXISTS idx_route_stops_route_id ON route_stops (route_id);
    CREATE INDEX IF NOT EXISTS idx_departures_stop_id ON departures (stop_id);
    CREATE INDEX IF NOT EXISTS idx_departures_route_id ON departures (route_id);
  `);

  return db;
}

export function getDatabase() {
  return new Database(DB_PATH);
}