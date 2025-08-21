import express from 'express';
export declare const handleValidationErrors: (req: express.Request, res: express.Response, next: express.NextFunction) => void;
export declare const validateUploadRequest: (((req: express.Request, res: express.Response, next: express.NextFunction) => void) | import("express-validator").ValidationChain)[];
export declare const validateVideoUpdate: (((req: express.Request, res: express.Response, next: express.NextFunction) => void) | import("express-validator").ValidationChain)[];
export declare const validateVideoId: (((req: express.Request, res: express.Response, next: express.NextFunction) => void) | import("express-validator").ValidationChain)[];
export declare const validateSegmentRequest: (((req: express.Request, res: express.Response, next: express.NextFunction) => void) | import("express-validator").ValidationChain)[];
