import { useState } from "react";
import { VideoSlider } from "@/components/tutorials/videoSlider";
import { VideoCard } from "@/components/tutorials/videoCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export function VideoTutorials() {
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation();
  const categories = [
    {
      title: "Market Research",
      videos: [
        {
          id: "1",
          title: "Semantic Company Search",
          description: "Find competitors with semantic search",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "0:32",
          playbackId: "example-playback-id-1",
        },
        {
          id: "2",
          title: "Crawl the websites of the competitors",
          description: "Craw the whole website of the industry players.",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "8:15",
          playbackId: "example-playback-id-2",
        },
        {
          id: "3",
          title: "Industry Monitoring",
          description: "Schedule daily syncs to keep your data up-to-date",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "12:45",
          playbackId: "example-playback-id-3",
        },
        {
          id: "4",
          title: "Generate reports",
          description: "Genereate deep reports on the industry",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "9:20",
          playbackId: "example-playback-id-4",
        },
      ],
    },
    {
      title: "Sales Data Enrichment",
      videos: [
        {
          id: "5",
          title: "Lead Generation Automation",
          description: "Automatically find and qualify potential customers",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "7:18",
          playbackId: "example-playback-id-5",
        },
        {
          id: "6",
          title: "Contact Information Enrichment",
          description: "Enrich your CRM with additional contact details",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "6:42",
          playbackId: "example-playback-id-6",
        },
        {
          id: "7",
          title: "Company Data Collection",
          description: "Gather comprehensive company information",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "10:30",
          playbackId: "example-playback-id-7",
        },
        {
          id: "8",
          title: "Sales Pipeline Automation",
          description: "Automate your entire sales research process",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "15:25",
          playbackId: "example-playback-id-8",
        },
      ],
    },
    {
      title: "General Research",
      videos: [
        {
          id: "9",
          title: "Academic Paper Research",
          description: "Automate literature reviews and paper analysis",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "11:15",
          playbackId: "example-playback-id-9",
        },
        {
          id: "10",
          title: "Legal Case Research",
          description: "Set up automated legal research workflows",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "13:50",
          playbackId: "example-playback-id-10",
        },
        {
          id: "11",
          title: "Web Scraping Basics",
          description: "Learn the fundamentals of automated data collection",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "9:35",
          playbackId: "example-playback-id-11",
        },
        {
          id: "12",
          title: "API Integration Guide",
          description: "Connect external APIs to your research workflows",
          thumbnail: "/placeholder.svg?height=180&width=320",
          duration: "14:20",
          playbackId: "example-playback-id-12",
        },
      ],
    },
  ];

  // Get all videos for search results
  const allVideos = categories.flatMap((category) => category.videos);

  // Filter videos based on search query
  const filteredVideos = allVideos.filter(
    (video) =>
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter categories for normal view (when no search)
  const filteredCategories = categories
    .map((category) => ({
      ...category,
      videos: category.videos.filter(
        (video) =>
          video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          video.description.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((category) => category.videos.length > 0);

  return (
    <div className="space-y-8">
      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          type="text"
          placeholder={t("tutorials_page.search_placeholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 border-border rounded-md"
        />
      </div>

      {searchQuery ? (
        // Search results view - simple sequential list
        <div className="space-y-2 max-w-2xl mx-auto">
          {filteredVideos.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {t("tutorials_page.no_tutorials", {
                  query: searchQuery,
                })}
              </p>
            </div>
          ) : (
            filteredVideos.map((video) => (
              <VideoCard key={video.id} {...video} />
            ))
          )}
        </div>
      ) : (
        // Normal categorized view with sliders
        filteredCategories.map((category, categoryIndex) => (
          <div key={categoryIndex} className="w-full">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              {category.title}
            </h3>
            <VideoSlider videos={category.videos} />
          </div>
        ))
      )}
    </div>
  );
}
