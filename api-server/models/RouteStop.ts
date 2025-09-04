import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRouteStop extends Document {
  route_id: Types.ObjectId;
  stop_id: Types.ObjectId;
  feed_id: Types.ObjectId;
}

const RouteStopSchema = new Schema<IRouteStop>({
  route_id: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
  stop_id: { type: Schema.Types.ObjectId, ref: 'Stop', required: true },
  feed_id: { type: Schema.Types.ObjectId, ref: 'Feed', required: true }
}, {
  timestamps: true
});

RouteStopSchema.index({ stop_id: 1, route_id: 1 });
RouteStopSchema.index({ route_id: 1, stop_id: 1 });
RouteStopSchema.index({ feed_id: 1 });

export default mongoose.models.RouteStop || mongoose.model<IRouteStop>('RouteStop', RouteStopSchema);