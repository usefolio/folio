import { VideoTutorials } from "@/components/tutorials/videoTutorials";
import { useTranslation } from "react-i18next";

const TutorialsRoute = () => {
  const { t } = useTranslation();
  return (
    <div className="bg-white min-h-screen w-full flex flex-col items-center pt-8 md:pt-16 px-4">
      <div className="w-full max-w-6xl">
        <h1 className="text-2xl md:text-3xl font-semibold text-center text-foreground mb-8">
          {t("tutorials_page.title")}
        </h1>
        <p className="text-center text-muted-foreground mb-12">
          {t("tutorials_page.subtitle")}
        </p>
        <VideoTutorials />
      </div>
    </div>
  );
};

export default TutorialsRoute;
