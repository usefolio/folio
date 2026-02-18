// Logger removed due to issues when deploying convex
// import { Logger } from "@/utils/Logger";
import { BackendClientConfig } from "@/interfaces/interfaces";
import { getFileExtension } from "@/utils/fileValidation";

/**
 * Error class for non-retryable HTTP errors (4xx client errors)
 */
class NonRetryableError extends Error {
  public status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "NonRetryableError";
    this.status = status;
  }
}

/**
 * A client for handling direct HTTP communication with external backend services.
 * This class abstracts away network request logic, including authorization,
 * retries, and progress tracking for uploads.
 */
export class BackendClient {
  private config: BackendClientConfig;
  // private logger: Logger;
  private retries: number;
  /**
   * Initializes a new instance of the BackendClient.
   * config - The configuration object containing dependencies like the Convex client and translation function.
   */
  constructor(config: BackendClientConfig) {
    this.config = config;
    // this.logger = new Logger({ service: "BackendClient" });
    this.retries = 3;
  }
  /**
   * Sends a POST request to a specified backend endpoint with a JSON payload.
   * Includes authorization headers and a retry mechanism.
   * baseUrl - The base URL of the backend service.
   * endpoint - The specific endpoint for the request (e.g., '/process').
   * payload - The data to be sent in the request body.
   * token - The authorization token for the request.
   * signal - An optional AbortSignal to allow for request cancellation.
   * returns a promise that resolves with the parsed JSON response.
   */
  public async request<T>(
    baseUrl: string,
    endpoint: string,
    payload: any,
    token: string,
    method: "POST" | "GET" | "PUT" | "DELETE" = "POST", // Make method a parameter
    signal?: AbortSignal,
  ): Promise<T> {
    const fullUrl = `${baseUrl}${endpoint}`;

    for (let i = 0; i < this.retries; i++) {
      try {
        const response = await fetch(fullUrl, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: typeof payload === "string" ? payload : JSON.stringify(payload),
          signal,
        });

        if (!response.ok) {
          // Use the error detail from the backend if available, otherwise use a generic message.
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          const errorMessage = error.detail ||
            this.config.t("services.backend_client.request_failed", {
              endpoint: endpoint,
            });
          
          // Don't retry on 4xx client errors (400-499) - these are not transient
          if (response.status >= 400 && response.status < 500) {
            console.error(
              `Request to ${endpoint} failed with ${response.status} (no retry):`,
              errorMessage,
            );
            throw new NonRetryableError(errorMessage, response.status);
          }
          
          // For 5xx errors, throw regular error to trigger retry logic
          throw new Error(errorMessage);
        }

        const text = await response.text();
        // Return an empty object for empty responses, otherwise parse the JSON.
        return text ? JSON.parse(text) : ({} as T);
      } catch (error) {
        if (signal?.aborted) throw error;
        
        // Don't retry NonRetryableError (4xx client errors)
        if (error instanceof NonRetryableError) {
          throw error;
        }

        const isLastAttempt = i === this.retries - 1;
        if (isLastAttempt) {
          console.error(
            `Request to ${endpoint} failed after ${this.retries} retries.`,
            { error },
          );
          throw error;
        }
        console.warn(
          `Request to ${endpoint} failed, retrying... (${i + 1}/${this.retries})`,
        );
        await new Promise((res) => setTimeout(res, 500 * (i + 1)));
      }
    }
    // This error is thrown if the retry loop completes without a successful request.
    throw new Error(
      this.config.t(
        "services.use_backend_client.request_failed_after_all_retries",
      ),
    );
  }
  /**
   * Uploads a file directly to a pre-signed URL, providing progress updates.
   * This method uses XMLHttpRequest instead of fetch to access upload progress events.
   * uploadUrl - The pre-signed URL obtained from the storage service.
   * file - The file to upload.
   * t - The translation function for error messages.
   * progressCallback - An optional function to receive progress updates (0-100).
   * returns a promise that resolves upon successful upload and rejects on error.
   */
  public uploadToSignedUrl(
    uploadUrl: string,
    file: File,
    t: (key: string, options?: Record<string, string>) => string,
    progressCallback?: (progress: number) => void,
  ) {
    // Using old XMLHttpRequest as fetch doesnt have an event for file progress
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        // Listen for progress events to update the UI.
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable && progressCallback) {
            const percentComplete = Math.round(
              (event.loaded / event.total) * 100,
            );
            progressCallback(percentComplete);
          }
        });
        // Handle successful upload.
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(
              new Error(
                t("services.upload_file_service.error_upload_to_signed_url"),
              ),
            );
          }
        });
        // Handle network errors.
        xhr.addEventListener("error", () => {
          reject(
            new Error(
              t("services.upload_file_service.error_upload_to_signed_url"),
            ),
          );
        });

        xhr.open("PUT", uploadUrl);
        // Note: for some storage providers, the Content-Type header must be set correctly
        // or omitted for certain file types. Browsers may automatically attach a Content-Type
        // for Blob/File. To guarantee NO Content-Type on structured (csv/parquet), send a
        // Blob with an empty type and avoid setting the header explicitly.
        const ext = getFileExtension(file.name);
        const isStructured = ext === "parquet" || ext === "csv";
        if (!isStructured) {
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        } else {
          const emptyTypeBlob = new Blob([file], { type: "" });
          xhr.send(emptyTypeBlob);
        }
      } catch (error) {
        console.error("Error uploading file:", { error });
        const message =
          error instanceof Error
            ? error.message
            : t(
                "services.upload_file_service.error_upload_to_signed_url_with_message",
                {
                  error: t("services.upload_file_service.upload_error_unknown"),
                },
              );
        reject(new Error(message));
      }
    });
  }
}
