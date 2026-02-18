// Define the error enum
export enum HttpMutationErrorType {
    NotFound = "NotFound",
    Unauthorized = "Unauthorized",
    ValidationError = "ValidationError",
    UnknownError = "UnknownError"
}

// Define a custom error class that uses the enum
export class HttpMutationError extends Error {
    public readonly type: HttpMutationErrorType;
    public readonly details?: any;

    constructor(type: HttpMutationErrorType, message: string, details?: any) {
        super(message);
        this.name = "HttpValidationErrorType";
        this.type = type;
        this.details = details;

        // Ensure the prototype chain is correctly set for Error
        Object.setPrototypeOf(this, HttpMutationError.prototype);
    }
}