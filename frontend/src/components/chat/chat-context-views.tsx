"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Database, X } from "lucide-react"

interface ContextView {
  name: string
  rowCount: number
}

interface ChatContextViewsProps {
  selectedViews: ContextView[]
  onRemoveView: (viewName: string) => void
  className?: string
}

export function ChatContextViews({ selectedViews, onRemoveView, className = "" }: ChatContextViewsProps) {
  if (selectedViews.length === 0) return null

  return (
    <div className={`px-4 py-2 border-t bg-muted/20 flex-shrink-0 ${className}`}>
      <div className="flex flex-wrap gap-2 justify-start">
        {selectedViews.map((view) => (
          <Badge
            key={view.name}
            variant="secondary"
            className="text-xs flex items-center gap-2 bg-background border shadow-sm"
          >
            <Database className="h-3 w-3" />
            {view.name}
            <span className="bg-muted-foreground/20 text-muted-foreground px-2 py-0.5 rounded-full text-[10px] font-medium h-4 flex items-center">
              {view.rowCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveView(view.name)}
              className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive ml-1 cursor-pointer"
            >
              <X className="h-2 w-2" />
            </Button>
          </Badge>
        ))}
      </div>
    </div>
  )
}
