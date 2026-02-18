import type React from "react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Play } from "lucide-react";
import { VideoModal } from "@/components/tutorials/videoModal";

export interface VideoCardProps {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  playbackId: string;
}

export function VideoCard({
  id,
  title,
  description,
  thumbnail,
  duration,
  playbackId,
}: VideoCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCardClick = () => {
    setIsModalOpen(true);
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <>
      <div
        className="flex items-center gap-3 p-3 border border-border hover:bg-border/40 cursor-pointer transition-colors group"
        onClick={handleCardClick}
      >
        <div className="relative flex-shrink-0">
          <img
            src={thumbnail || "/placeholder.svg"}
            alt={title}
            className="w-16 h-12 object-cover"
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-200 flex items-center justify-center">
            <Button
              variant="default"
              onClick={handlePlayClick}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-orange-600 h-6 w-6 p-0 rounded-md"
            >
              <Play className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
          <div className="absolute bottom-0 right-0 bg-foreground bg-opacity-75 text-white px-1 py-0.5 text-[10px]">
            {duration}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-medium truncate">{title}</h4>
          <p className="text-[10px] text-muted-foreground truncate">
            {description}
          </p>
        </div>
      </div>

      <VideoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        video={{ id, title, description, thumbnail, duration, playbackId }}
      />
    </>
  );
}
