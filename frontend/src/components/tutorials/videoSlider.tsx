import { useRef } from "react";
import {
  VideoCard,
  type VideoCardProps,
} from "@/components/tutorials/videoCard";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface VideoSliderProps {
  videos: VideoCardProps[];
}

export function VideoSlider({ videos }: VideoSliderProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = scrollContainerRef.current.clientWidth;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 md:gap-4">
        {/* Left Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => scroll("left")}
          className="h-8 w-8 p-0 flex-shrink-0 rounded-md"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* MODIFIED: This is now a scroll container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto snap-x snap-mandatory no-scrollbar"
        >
          {/* MODIFIED: This is the track for the cards */}
          <div className="flex gap-2">
            {videos.map((video) => (
              // MODIFIED: Card widths are now defined with responsive Tailwind classes
              <div
                key={video.id}
                className="flex-shrink-0 snap-start w-full sm:w-[calc((100%-0.5rem)/2)] lg:w-[calc((100%-1rem)/3)]"
              >
                <VideoCard {...video} />
              </div>
            ))}
          </div>
        </div>

        {/* Right Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => scroll("right")}
          className="h-8 w-8 p-0 flex-shrink-0 rounded-md"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
