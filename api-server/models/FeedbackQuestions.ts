import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFeedbackQuestion extends Document {
    question: string;
    service: 'stop' | 'route' | 'vehicle' | 'provider' | 'wayline';
    type: 'amenities-availability' | 'cleanliness' | 'safety' | 'punctuality' | 'overall-experience' | 'security' | 'app-general' | 'app-routes' | 'app-stops' | 'app-realtime' | 'app-location' | 'app-other' | 'other';
    options: string[];
}

const FeedbackQuestionSchema = new Schema<IFeedbackQuestion>({
    question: { type: String, required: true },
    options: { type: [String], required: true },
}, {
    timestamps: true
});

export default mongoose.models.FeedbackQuestion || mongoose.model<IFeedbackQuestion>('FeedbackQuestion', FeedbackQuestionSchema);