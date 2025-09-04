import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserFeedback extends Document {
  user_id: Types.ObjectId;
  question_id: Types.ObjectId;
  answer: string;
  createdAt: Date;
}

const UserFeedbackSchema = new Schema<IUserFeedback>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  question_id: { type: Schema.Types.ObjectId, ref: 'FeedbackQuestion', required: true },
  answer: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.UserFeedback || mongoose.model<IUserFeedback>('UserFeedback', UserFeedbackSchema);