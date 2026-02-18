import React, { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { SheetMenuProps } from "@/interfaces/interfaces";
import { useLogger } from "../utils/Logger";
import { ScrollArea } from "./ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Doc } from "convex/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { useDataContext } from "@/context/DataContext";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";

const SheetMenu: React.FC<SheetMenuProps> = (props) => {
  const logger = useLogger("src/SheetMenu.tsx");
  const { sheets, sheet, setSheet, disableInteraction, creatingSheetId } =
    props;
  const { t } = useTranslation();
  const { hasMoreSheets, loadMoreSheets, sheetsLoading } = useDataContext();
  // Debug logging
  useEffect(() => {
    logger.debug("SheetMenu - Current sheet:", { sheet });
    logger.debug("SheetMenu - All sheets:", { sheets });

    // Ensure all sheets have the hidden property initialized as an array
    sheets.forEach((s) => {
      if (!s.hidden) {
        s.hidden = [];
      }
    });
  }, [logger, sheet, sheets]);

  const onSheetsMenuClick = (key: string) => {
    if (disableInteraction) {
      return;
    }

    logger.debug("Clicked menu item key:", { key });
    const selectedSheet = sheets.find((sheet) => sheet?._id === key);
    if (selectedSheet) {
      logger.debug("Selected sheet:", { selectedSheet });
      setSheet(selectedSheet as Doc<"sheet">);
    } else {
      logger.warn("Sheet not found for key:", { key });
    }
  };

  // Function to truncate text to 10 characters with ellipsis
  const truncateText = (text: string) => {
    if (!text) return "";
    return text.length > 10 ? text.substring(0, 10) + "..." : text;
  };

  const isViewBeingCreated = (viewSheetId: string) => {
    return creatingSheetId === viewSheetId;
  };

  return (
    <div className="w-full">
      <div className="flex items-center">
        <Tabs value={sheet?._id} onValueChange={onSheetsMenuClick}>
          <TabsList className="rounded-none bg-transparent p-0 h-full w-max inline-flex">
            {sheets.map((view) => (
              <TooltipProvider key={view?._id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger
                      value={view?._id}
                      className={`relative bg-transparent rounded-none border-b-2 border-transparent px-4 py-2 aria-selected:!border-primary aria-selected:!bg-background aria-selected:text-foreground text-xs whitespace-nowrap max-w-[200px] ${
                        disableInteraction
                          ? "pointer-events-none opacity-70"
                          : ""
                      }`}
                    >
                      {isViewBeingCreated(view._id) && (
                        <Loader2 className="h-3 w-3 mr-2 animate-spin text-primary" />
                      )}
                      <span className="block overflow-hidden text-ellipsis max-w-[120px]">
                        {truncateText(view?.name)}
                      </span>
                      <span className="ml-2 bg-muted px-1.5 py-0.5 text-xs font-medium">
                        {view?.rows_in_sheet_counter?.toLocaleString() || 0}
                      </span>
                    </TabsTrigger>
                  </TooltipTrigger>
                  <ScrollArea type="scroll" className="max-w-80 max-h-80">
                    <TooltipContent
                      className="max-w-80 max-h-80 overflow-auto"
                      style={{
                        wordBreak: "break-word",
                      }}
                    >
                      {isViewBeingCreated(view._id) && (
                        <p className="text-[9px] text-primary mt-1">
                          {t("sheet_menu.creating_view")}
                        </p>
                      )}
                      <p className="text-xs">{view.name}</p>
                      {view?.hidden && view?.hidden?.length > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-1">
                          {t("sheet_menu.columns_hidden")} {view.hidden.length}
                        </p>
                      )}
                    </TooltipContent>
                  </ScrollArea>
                </Tooltip>
              </TooltipProvider>
            ))}
          </TabsList>
        </Tabs>
        {hasMoreSheets ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-md text-xs text-muted-foreground"
            onClick={loadMoreSheets}
          >
            {t("sheet_menu.load_more")}
          </Button>
        ) : sheetsLoading ? (
          <Button
            variant="ghost"
            size="sm"
            disabled
            className="h-8 rounded-md text-xs"
            onClick={loadMoreSheets}
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </Button>
        ) : (
          <></>
        )}
        <div className="flex-shrink-0 ml-2"></div>
      </div>
    </div>
  );
};

export default React.memo(SheetMenu);
