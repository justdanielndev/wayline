import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IStop extends Document {
  feed_id: Types.ObjectId;
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  location_type: number;
  amenities: string[];
  parent_station?: string;
  location: {
    type: string;
    coordinates: [number, number];
  };
  is_bike_station?: boolean;
  bike_capacity?: number;
  provider_type?: string;
  provider_id?: string;
  stop_code?: string;
  wheelchair_boarding?: number;
  jcdecaux_contract?: string;
  jcdecaux_number?: number;
}

const StopSchema = new Schema<IStop>({
  feed_id: { type: Schema.Types.ObjectId, ref: 'Feed', required: true },
  stop_id: { type: String, required: true },
  stop_name: { type: String, required: true },
  stop_lat: { type: Number, required: true },
  stop_lon: { type: Number, required: true },
  location_type: { type: Number, default: 0 },
  amenities: { type: [String], default: [] },
  parent_station: { type: String },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  is_bike_station: { type: Boolean, default: false },
  bike_capacity: { type: Number },
  provider_type: { type: String },
  provider_id: { type: String },
  stop_code: { type: String },
  wheelchair_boarding: { type: Number },
  jcdecaux_contract: { type: String },
  jcdecaux_number: { type: Number }
}, {
  timestamps: true
});

StopSchema.index({ location: '2dsphere' });
StopSchema.index({ feed_id: 1, stop_id: 1 });

export default mongoose.models.Stop || mongoose.model<IStop>('Stop', StopSchema);