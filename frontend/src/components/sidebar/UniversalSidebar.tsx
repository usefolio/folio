import React, { ReactNode, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

// UniversalSidebar props
interface UniversalSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

const UniversalSidebar: React.FC<UniversalSidebarProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = "500px",
}) => {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState("translateX(100%)");
  const [opacity, setOpacity] = useState(0);
  const isMobile = useIsMobile();
  const effectiveWidth = isMobile ? "100%" : width;
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const timer = setTimeout(() => {
        setPosition("translateX(0)");
        setOpacity(1);
      }, 50);

      return () => clearTimeout(timer);
    } else {
      setPosition("translateX(100%)");
      setOpacity(0);
      const timer = setTimeout(() => {
        setMounted(false);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isOpen]);
  if (!mounted) return null;
  if (!children) return null;

  return (
    <div className="sidebar-container">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-white/80 transition-opacity duration-300 ease-in-out z-40 ${opacity > 0 ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{ opacity }}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className="fixed top-0 right-0 z-50 flex h-full flex-col bg-background shadow-[-2px_0_10px_rgba(0,0,0,0.1)]"
        style={{
          width: effectiveWidth,
          transform: position,
          transition: "transform 300ms ease-in-out",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-2 pr-4 pl-4">
          <h2 className="text-sm font-medium">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-sm"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
};

export default UniversalSidebar;
