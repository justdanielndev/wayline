import mongoose, { Schema, Document } from 'mongoose';

export interface IFeed extends Document {
  onestop_id: string;
  name: string;
  spec: string;
  last_updated: Date;
  feed_version_sha1?: string;
}

const FeedSchema = new Schema<IFeed>({
  onestop_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  spec: { type: String, required: true },
  last_updated: { type: Date, default: Date.now },
  feed_version_sha1: { type: String }
}, {
  timestamps: true
});

export default mongoose.models.Feed || mongoose.model<IFeed>('Feed', FeedSchema);