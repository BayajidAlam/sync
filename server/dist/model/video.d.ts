import mongoose, { Document } from 'mongoose';
import { VideoStatus } from '../types/index.js';
export interface IVideo extends Document {
    _id: string;
    title: string;
    description?: string;
    filename: string;
    fileSize: number;
    duration?: number;
    status: VideoStatus;
    thumbnailUrl?: string;
    videoUrl?: string;
    manifestUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const VideoModel: mongoose.Model<IVideo, {}, {}, {}, mongoose.Document<unknown, {}, IVideo, {}> & IVideo & Required<{
    _id: string;
}> & {
    __v: number;
}, any>;
