"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Bot, ChevronDown, Send, FileText, Loader2 } from "lucide-react"

interface ChatInputFooterProps {
  selectedModel: string
  models: string[]
  onModelChange: (model: string) => void
  onSend: () => void
  onAutoGenerateReport?: () => void
  sendDisabled: boolean
  className?: string
  isLoading?: boolean
}

export function ChatInputFooter({
  selectedModel,
  models,
  onModelChange,
  onSend,
  onAutoGenerateReport,
  sendDisabled,
  className = "",
  isLoading = false,
}: ChatInputFooterProps) {
  return (
    <div className={`flex items-center justify-between pb-1 px-1 ${className}`}>
      {/* Model Selector and Auto-Generate Report Button */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-3 text-xs bg-muted/50 hover:bg-muted rounded-md cursor-pointer">
              <Bot className="h-3 w-3 mr-1" />
              {selectedModel}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-32">
            {models.map((model) => (
              <DropdownMenuItem
                key={model}
                onClick={() => onModelChange(model)}
                className={`cursor-pointer ${selectedModel === model ? "bg-accent text-accent-foreground font-medium" : ""}`}
              >
                <div className="flex items-center justify-between w-full">
                  {model}
                  {selectedModel === model && <div className="w-1.5 h-1.5 rounded-md bg-primary ml-2" />}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {onAutoGenerateReport && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md h-[26px] px-3 py-1.5 text-xs cursor-not-allowed opacity-60"
            onClick={onAutoGenerateReport}
            disabled
          >
            <FileText className="h-3 w-3 mr-1" />
            Auto Report
          </Button>
        )}
      </div>

      {/* Helper Text and Send Button */}
      <div className="flex items-center gap-3">
        
        <Button onClick={onSend} size="icon" className="rounded-md mr-1 mt-1 h-8 w-8" disabled={sendDisabled}>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
