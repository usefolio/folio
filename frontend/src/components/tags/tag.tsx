import { Badge } from "../ui/badge";
import { getColorForTag, hexColorPalette } from "@/utils/CellDraw";
import React from "react";
import { TagProps } from "@/interfaces/interfaces";

const Tag: React.FC<TagProps> = ({
  tag,
  colorName: providedColorName,
  children,
  className,
}) => {
  const colorName = providedColorName || getColorForTag(tag as string[]);

  const colorStyle =
    hexColorPalette[colorName as keyof typeof hexColorPalette] ||
    hexColorPalette.charcoal;

  const backgroundColor = colorStyle?.bg;
  const textColor = colorStyle?.text;
  const borderColor = colorStyle?.border;

  return (
    <Badge
      variant="outline"
      className={`whitespace-normal leading-[20px] px-1 py-[1.5px] rounded-none z-1 pointer-events-auto text-xs font-[550] ${className && className}`}
      style={{
        backgroundColor: backgroundColor,
        color: textColor,
        whiteSpace: "normal",
        wordBreak: "break-word",
        border: `1.2px solid ${borderColor}`,
      }}
    >
      {children}
    </Badge>
  );
};

export default Tag;
