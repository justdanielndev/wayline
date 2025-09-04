import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRoute extends Document {
  feed_id: Types.ObjectId;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  agency_id: string;
  agency_name: string;
  geometry?: any;
  is_complete?: boolean;
  total_stops?: number;
  cached_stops?: number;
}

const RouteSchema = new Schema<IRoute>({
  feed_id: { type: Schema.Types.ObjectId, ref: 'Feed', required: true },
  route_id: { type: String, required: true },
  route_short_name: { type: String },
  route_long_name: { type: String },
  route_type: { type: Number, default: 0 },
  route_color: { type: String, default: '#6b46c1' },
  agency_id: { type: String },
  agency_name: { type: String },
  geometry: { type: Schema.Types.Mixed },
  is_complete: { type: Boolean, default: true },
  total_stops: { type: Number, default: 0 },
  cached_stops: { type: Number, default: 0 }
}, {
  timestamps: true
});

RouteSchema.index({ feed_id: 1, route_id: 1 });

export default mongoose.models.Route || mongoose.model<IRoute>('Route', RouteSchema);