import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAmenity extends Document {
    amenity_id: string;
    amenity_name: string;
    amenity_type: string;
    amenity_item_id: string;
}

const AmenitySchema = new Schema<IAmenity>({
    amenity_id: { type: String, required: true },
    amenity_name: { type: String, required: true },
    amenity_type: { type: String, enum: ['stop', 'station', 'vehicle', 'other'], required: true },
    amenity_item_id: { type: String, required: true },
});

export const Amenity = mongoose.model<IAmenity>('Amenity', AmenitySchema);