import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  video: {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    duration: string;
    playbackId: string;
  };
}

export function VideoModal({ isOpen, onClose, video }: VideoModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { t } = useTranslation();
  const handlePlay = () => {
    setIsPlaying(true);
    // Here you would integrate with Mux player
    console.log(`Playing video with Mux ID: ${video.playbackId}`);
  };

  const handleTryIt = () => {
    // This would navigate to the main automation page or open the workflow
    console.log("Try It clicked for:", video.title);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[800px] h-[600px] p-0 overflow-hidden !rounded-md">
        <div className="flex h-full rounded-md">
          {/* Video Section - Left Side */}
          <div className="flex-1 bg-foreground relative">
            {!isPlaying ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={video.thumbnail || "/placeholder.svg"}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-foreground bg-opacity-40 flex items-center justify-center">
                  <Button
                    variant="default"
                    onClick={handlePlay}
                    className="hover:bg-orange-600 h-12 w-12 p-0 rounded-md"
                  >
                    <Play className="h-8 w-8 ml-1" />
                  </Button>
                </div>
                <div className="absolute bottom-4 right-4 bg-foreground bg-opacity-75 text-white text-sm px-2 py-1">
                  {video.duration}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white">
                {/* This is where the Mux player would be integrated */}
                <div className="text-center">
                  <p className="text-base mb-2">
                    {t("tutorials_page.video_player")}
                  </p>
                  <p className="text-xs opacity-75">
                    {t("tutorials_page.mux_player_id", {
                      id: video.playbackId,
                    })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Description Section - Right Side */}
          <div className="w-80 bg-white p-6 flex flex-col relative">
            <div className="mb-4">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold leading-tight">
                  {video.title}
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="flex-1">
              <p className="text-muted-foreground text-xs leading-relaxed">
                {video.description}
              </p>
            </div>

            {/* Try It Button - Bottom Right */}
            <div className="absolute bottom-6 right-6">
              <Button
                variant="default"
                onClick={handleTryIt}
                className="h-8 hover:bg-orange-600 px-4 py-2 rounded-md"
              >
                {t("tutorials_page.try_it_button")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
