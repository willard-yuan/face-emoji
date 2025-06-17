import { FaceDetection, FaceExpressions } from 'face-api.js';

// Face-api.js type definitions
export interface FaceDetection {
    box: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    score: number;
}

export interface FaceExpressions {
    angry: number;
    disgusted: number;
    fearful: number;
    happy: number;
    neutral: number;
    sad: number;
    surprised: number;
}

export interface WithFaceExpressions<T> {
    detection: FaceDetection;
    expressions: FaceExpressions;
}

export type DetectionsWithExpressions = {
    detection: FaceDetection;
    expressions: FaceExpressions;
};
