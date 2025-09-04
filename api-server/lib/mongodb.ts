import mongoose from 'mongoose';

function getMongoUri() {
  const MONGO_USER = process.env.MONGO_USER || '';
  const MONGO_PASS = process.env.MONGO_PASS || '';
  const MONGO_DOMAIN = process.env.MONGO_DOMAIN || '';

  if (!MONGO_USER || !MONGO_PASS || !MONGO_DOMAIN) {
    throw new Error('Please define MongoDB connection variables in .env.local');
  }

  return `mongodb+srv://${MONGO_USER}:${MONGO_PASS}@${MONGO_DOMAIN}/wayline?retryWrites=true&w=majority`;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    const MONGODB_URI = getMongoUri();
    cached.promise = mongoose.connect(MONGODB_URI, opts);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

declare global {
  var mongoose: {
    conn: any | null;
    promise: Promise<any> | null;
  };
}