import { toast } from "sonner";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "../ui/progress";

interface ErrorDetailProps {
  errors: string;
}

// Component to render error details in notifications
const ErrorDetails: React.FC<ErrorDetailProps> = ({ errors }) => {
  const { t } = useTranslation();
  if (!errors) return null;

  return (
    <div className="mt-2 text-xs">
      <div className="font-medium mb-1">
        {t("app.notifications.files_failed_to_upload")}
      </div>
      <div className="whitespace-pre-line text-left pl-1">{errors}</div>
    </div>
  );
};

const SuccessToast = ({
  title,
  message,
  errorDetails,
  toastId,
}: {
  title: string;
  message: string;
  errorDetails?: string;
  toastId: string | number;
}) => (
  <div className="flex items-start mb-2">
    <div className="flex">
      <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-sm text-gray-500">{message}</p>
        {errorDetails && <ErrorDetails errors={errorDetails} />}
      </div>
    </div>
    <button
      onClick={() => toast.dismiss(toastId)}
      className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-500 focus:outline-none"
      aria-label="Close notification"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

const ErrorToast = ({
  title,
  message,
  errorDetails,
  toastId,
}: {
  title: string;
  message: string;
  errorDetails?: string;
  toastId: string | number;
}) => (
  <div className="flex items-start mb-2">
    <div className="flex">
      <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-sm text-gray-500">{message}</p>
        {errorDetails && <ErrorDetails errors={errorDetails} />}
      </div>
    </div>
    <button
      onClick={() => toast.dismiss(toastId)}
      className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-500 focus:outline-none"
      aria-label="Close notification"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

const InfoToast = ({
  title,
  message,
  toastId,
}: {
  title: string;
  message: string;
  toastId: string | number;
}) => (
  <div className="flex items-start mb-2">
    <Info className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0" />
    <div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="mt-0.5 text-sm text-gray-500">{message}</p>
    </div>
    <button
      onClick={() => toast.dismiss(toastId)}
      className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-500 focus:outline-none"
      aria-label="Close notification"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

const ProgressToast = ({
  title,
  message,
  toastId,
  progress,
  total,
}: {
  title: string;
  message: string;
  toastId: string | number;
  progress: number;
  total: number;
}) => {
  const progressPercentage = total > 0 ? (progress / total) * 100 : 0;

  return (
    <div className="flex flex-col w-full">
      <div className="flex items-start mb-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="mt-0.5 text-sm text-gray-500">{message}</p>
        </div>
        <button
          onClick={() => toast.dismiss(toastId)}
          className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-500 focus:outline-none"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-row justify-between items-center">
        <Progress
          value={progressPercentage}
          indicatorColor="bg-primary"
          className="!h-2 !rounded-md"
        />
        <div className="text-xs text-gray-500 ml-2 min-w-14 text-center">
          {progress} / {total}
        </div>
      </div>
    </div>
  );
};

// Show success notification with partial success and error display
export const showSuccessNotification = (
  title: string,
  message: string,
  errorDetails?: string,
  duration = 5000,
) => {
  const hasErrorDetails = !!errorDetails;

  return toast.custom(
    (toastId) => (
      <SuccessToast
        title={title}
        message={message}
        errorDetails={errorDetails}
        toastId={toastId}
      />
    ),
    {
      duration: hasErrorDetails ? duration * 2 : duration, // Give more time to read error details
      className: "!p-2.5 !bg-gray-50 !border !border-gray-200 !rounded-md",
    },
  );
};

// Show error notification with detailed error listing
export const showErrorNotification = (
  title: string,
  message: string,
  errorDetails?: string,
  duration = 6000,
) => {
  const hasErrorDetails = !!errorDetails;

  return toast.custom(
    (toastId) => (
      <ErrorToast
        title={title}
        message={message}
        errorDetails={errorDetails}
        toastId={toastId}
      />
    ),
    {
      duration: hasErrorDetails ? duration * 2 : duration, // Give more time to read error details
      className: "!p-2.5 !bg-gray-50 !border !border-gray-200 !rounded-md",
    },
  );
};

// Info notification
export const showInfoNotification = (
  title: string,
  message: string,
  duration = 5000,
) => {
  return toast.custom(
    (toastId) => (
      <InfoToast title={title} message={message} toastId={toastId} />
    ),
    {
      duration,
      className: "!p-2.5 !bg-gray-50 !border !border-gray-200 !rounded-md",
    },
  );
};

export const showProgressNotification = (
  title: string,
  message: string,
  progress: number,
  total: number,
) => {
  const toastId = `progress-${Date.now()}`;

  return {
    id: toastId,
    show: () => {
      toast.custom(
        (id) => (
          <ProgressToast
            title={title}
            message={message}
            toastId={id}
            progress={progress}
            total={total}
          />
        ),
        {
          id: toastId,
          duration: Infinity, // Keep it open until manually dismissed
          position: "bottom-right",
          className:
            "!p-2.5 !bg-gray-50 !border !border-gray-200 !rounded-md",
        },
      );
    },
    update: (newProgress: number) => {
      toast.custom(
        (id) => (
          <ProgressToast
            title={title}
            message={message}
            toastId={id}
            progress={newProgress}
            total={total}
          />
        ),
        {
          id: toastId,
          duration: Infinity,
          position: "bottom-right",
          className:
            "!p-2.5 !bg-gray-50 !border !border-gray-200 !rounded-md",
        },
      );
    },
    dismiss: (delay?: number) => {
      if (delay) {
        setTimeout(() => toast.dismiss(toastId), delay);
      } else {
        toast.dismiss(toastId);
      }
    },
  };
};
