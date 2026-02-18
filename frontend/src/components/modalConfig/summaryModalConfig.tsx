import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "../ui/badge";
import {
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  ArrowRight,
  Send,
  ChevronRight,
  ChevronLeft,
  Circle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "../ui/separator";
import { useUser } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export default function SummaryModalConfig() {
  const [currentSuggestion, setCurrentSuggestion] = useState(0);
  const [askOrbyInput, setAskOrbyInput] = useState("");
  const { user } = useUser();
  const [greeting, setGreeting] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting(t("modal_manager.summary_modal_config.good_morning"));
    } else if (hour < 18) {
      setGreeting(t("modal_manager.summary_modal_config.good_afternoon"));
    } else if (hour < 22) {
      setGreeting(t("modal_manager.summary_modal_config.good_evening"));
    } else {
      setGreeting(t("modal_manager.summary_modal_config.good_night"));
    }
  }, [t]);

  const suggestions = [
    {
      title: "Pause off-hours Analytics Refresh",
      description:
        "Your Analytics Refresh ran 132 times last weekend processing zero rows.",
      suggestion:
        "Schedule it to sleep between 6 PM–8 AM (Mon–Fri) to save compute.",
      condition: "Current time is 8AM–6PM, Monday to Friday",
    },
    {
      title: "Optimize Database Queries",
      description:
        "Several queries are running slower than expected during peak hours.",
      suggestion:
        "Add indexes to frequently queried columns to improve performance by 40%.",
      condition: "Query response time > 2 seconds during business hours",
    },
    {
      title: "Scale Auto-backup Schedule",
      description:
        "Backup processes are consuming resources during active user sessions.",
      suggestion:
        "Move backup schedule to 2 AM–4 AM when system usage is minimal.",
      condition: "System load > 80% during backup windows",
    },
  ];

  const handleNextSuggestion = () => {
    setCurrentSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
  };

  const handlePreviousSuggestion = () => {
    setCurrentSuggestion((prev) => Math.max(prev - 1, 0));
  };

  const hasPrevious = currentSuggestion > 0;
  const hasNext = currentSuggestion < suggestions.length - 1;

  return (
    <div className="flex items-center justify-center">
      <div className="bg-background rounded-md shadow-2xl w-full overflow-y-auto">
        <div className="py-4 px-8 space-y-4">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">
              {greeting}, {user?.firstName}!
            </h2>
            <p className="text-muted-foreground">
              {t("modal_manager.summary_modal_config.subtitle")}
            </p>
          </div>

          {/* Summary Stats */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {t("modal_manager.summary_modal_config.stats.there_were")}
              </span>
              <Badge
                variant="outline"
                className="bg-orange-100 text-primary px-2 py-0.5 rounded-none text-sm font-normal border-none"
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                {t("modal_manager.summary_modal_config.stats.issues", {
                  count: 13,
                })}
              </Badge>
              <span>{t("modal_manager.summary_modal_config.stats.and")}</span>
              <Badge
                variant="outline"
                className="bg-green-100 text-green-500 px-2 py-0.5 rounded-none text-sm font-normal border-none"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {t("modal_manager.summary_modal_config.stats.resolved", {
                  count: 11,
                })}
              </Badge>
            </div>
            <p>{t("modal_manager.summary_modal_config.stats.no_breaches")}</p>
            <div className="flex items-center gap-2">
              <span>
                {t("modal_manager.summary_modal_config.stats.here_are")}
              </span>
              <Badge
                variant="outline"
                className="bg-blue-100 text-blue-500 px-2 py-0.5 rounded-none text-sm font-normal border-none"
              >
                <Lightbulb className="w-4 h-4 mr-1" />
                {t("modal_manager.summary_modal_config.stats.suggestions", {
                  count: 3,
                })}
              </Badge>
              <span>
                {t("modal_manager.summary_modal_config.stats.to_improve")}
              </span>
            </div>
          </div>

          {/* Suggestion Card */}
          <Card className="bg-background shadow-md border-px border-border rounded-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {suggestions[currentSuggestion].title}
                </h3>
                <span className="text-muted-foreground text-sm">
                  {t("modal_manager.summary_modal_config.suggestion_card.of", {
                    current: currentSuggestion + 1,
                    total: suggestions.length,
                  })}
                </span>
              </div>

              <p className="text-sm mb-6 leading-relaxed">
                {suggestions[currentSuggestion].description}
              </p>

              <div className="bg-gray-50 p-4 rounded-md mb-8">
                <div className="text-sm text-muted-foreground mb-2">
                  {t(
                    "modal_manager.summary_modal_config.suggestion_card.suggestion",
                  )}
                </div>
                <p className="font-normal text-xs">
                  {suggestions[currentSuggestion].suggestion}
                </p>
              </div>

              <div className="mb-8">
                <div className="flex items-center justify-center p-1">
                  <div className="flex items-center gap-4">
                    <Circle
                      className={cn(
                        "h-2 w-2",
                        hasPrevious ? "text-primary" : "text-muted-foreground",
                      )}
                      fill={
                        hasPrevious
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted-foreground))"
                      }
                    />
                    <Separator
                      className={cn(
                        "w-40 h-px",
                        hasPrevious ? "bg-primary" : "bg-muted-foreground",
                      )}
                    />
                    <div className="bg-background border border-primary rounded-md px-4 py-2 relative shadow-sm w-48">
                      <div className="flex items-center gap-2 text-primary text-sm font-medium mb-1 max-w">
                        <div className="w-2 h-2 bg-primary rounded-full text-sm"></div>
                        {t(
                          "modal_manager.summary_modal_config.suggestion_card.condition",
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {suggestions[currentSuggestion].condition}
                      </div>
                    </div>
                    <Separator
                      className={cn(
                        "w-40 h-px",
                        hasNext ? "bg-primary" : "bg-muted-foreground",
                      )}
                    />
                    <Circle
                      className={cn(
                        "h-2 w-2",
                        hasNext ? "text-primary" : "text-muted-foreground",
                      )}
                      fill={
                        hasNext
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted-foreground))"
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <Button
                    variant="default"
                    className="px-4 py-2 rounded-md h-8 hover:bg-orange-600"
                  >
                    {t(
                      "modal_manager.summary_modal_config.suggestion_card.review_button",
                    )}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-4 py-2 rounded-md h-8"
                  >
                    {t(
                      "modal_manager.summary_modal_config.suggestion_card.remind_button",
                    )}
                  </Button>
                </div>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-4 py-2 rounded-md h-8"
                    onClick={handlePreviousSuggestion}
                    disabled={!hasPrevious}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    {t(
                      "modal_manager.summary_modal_config.suggestion_card.previous_button",
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-4 py-2 rounded-md h-8"
                    onClick={handleNextSuggestion}
                    disabled={!hasNext}
                  >
                    {t(
                      "modal_manager.summary_modal_config.suggestion_card.next_button",
                    )}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ask Orby */}
          <div className="flex items-center gap-4 max-w-2xl">
            <div className="w-12 h-12 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0">
              <div className="w-6 h-6 bg-primary rounded-full"></div>
            </div>
            <div className="flex-1 relative">
              <Input
                placeholder={t(
                  "modal_manager.summary_modal_config.ask_orby_placeholder",
                )}
                value={askOrbyInput}
                onChange={(e) => setAskOrbyInput(e.target.value)}
                className="pr-12 h-12 border border-border rounded-md"
              />
              <Button
                size="sm"
                variant="default"
                className="absolute right-2 top-2 h-8 w-8 p-0 rounded-md hover:bg-orange-600"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
