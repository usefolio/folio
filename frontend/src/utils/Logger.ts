// Import useMemo from React to help optimize logger instances.
import { useMemo } from "react";
import { LogLevelLogger } from "../types/types";
import { LoggerOptions } from "../interfaces/interfaces";

// Define the order of log levels by priority, from least to most critical.
const logLevels: LogLevelLogger[] = ["debug", "info", "warn", "error"];

// Function to return the current log level based on the environment.
// In production, log only the important events.
// In development, log the above but also debugging messages.
const isViteEnvironment = typeof import.meta.env !== "undefined";
const getCurrentLogLevel = (): LogLevelLogger => {
  const env = isViteEnvironment
    ? import.meta.env.VITE_ENVIRONMENT
    : process.env.NODE_ENV;
  return env === "production" ? "info" : "debug";
};

// Determines whether a log at a given level should be displayed.
// If the level is lower priority than the current environment level, skip it.
const shouldLog = (level: LogLevelLogger): boolean => {
  const currentLevel = getCurrentLogLevel();
  return logLevels.indexOf(level) >= logLevels.indexOf(currentLevel);
};
// The main Logger class.
export class Logger {
  private service: string;

  constructor({ service }: LoggerOptions) {
    this.service = service;
  }

  private getLogLevelStyles(level: LogLevelLogger): {
    levelStyle: string;
    messageStyle: string;
  } {
    switch (level) {
      case "debug":
        // Blue, green for text
        return {
          levelStyle: "color: #3b82f6; font-weight: bold;",
          messageStyle: "color: #1aa85b;",
        };
      case "info":
        // Green, blue for text
        return {
          levelStyle: "color: #10b981; font-weight: bold;",
          messageStyle: "color: #3b82f6",
        }; // Green
      case "warn":
        // Yellow, green for text
        return {
          levelStyle: "color: #facc15; font-weight: bold;",
          messageStyle: "color: #1aa85b;",
        };
      case "error":
        // Red, green for text
        return {
          levelStyle: "color: #dc2626; font-weight: bold;",
          messageStyle: "color: #1aa85b;",
        };
      default:
        return { levelStyle: "color: #fff;", messageStyle: "color: #fff;" };
    }
  }
  private formatTimestamp(): string {
    const date = new Date();

    // Format date: YYYY-MM-DD
    const datePart = date.toISOString().split("T")[0];

    // Format time: HH:mm:ss.SSS
    const timePart = date
      .toLocaleTimeString("en-GB", { hour12: false })
      .concat(".", date.getMilliseconds().toString().padStart(3, "0"));

    return `${datePart} ${timePart}`;
  }
  private log(
    level: LogLevelLogger,
    message: string,
    meta?: Record<string, any>,
  ) {
    if (!shouldLog(level)) return;

    const timestamp = this.formatTimestamp();
    const { levelStyle, messageStyle } = this.getLogLevelStyles(level);

    const logParts = [
      // Timestamp
      `%c[${timestamp}]`,
      // Service and log level
      `%c[${this.service}] ${level.toUpperCase()}:`,
      // Log message
      `%c${message}`,
    ];

    const styles = [
      // Timestamp style
      "color: darkorange; font-weight: bold;",
      // Log level style
      levelStyle,
      // Message style
      messageStyle,
    ];

    if (meta) {
      console.log(logParts.join(" "), ...styles, meta);
    } else {
      console.log(logParts.join(" "), ...styles);
    }
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, any>) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.log("error", message, meta);
  }
}

// React hook for getting a logger instance.
// useMemo to ensure the logger is only created once per component lifecycle.
export const useLogger = (service: string) => {
  return useMemo(() => new Logger({ service }), [service]);
};
