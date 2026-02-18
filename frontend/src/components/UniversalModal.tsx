import React, { useRef, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { UniversalModalProps } from "../interfaces/interfaces";

const UniversalModal: React.FC<UniversalModalProps> = ({
  isOpen,
  title,
  closeModal,
  content,
  headerElement = null,
  subtitle = "",
  footer = null,
  modalType,
  isTableVisible,
  modalSubtype,
  preventClose,
  activeTab,
  exaSearchType,
  exaActionType,
}) => {
  // Track previous visibility state and modal type
  const prevExaSearchTypeRef = useRef(exaSearchType);
  const prevExaActionTypeRef = useRef(exaActionType);
  const prevTableVisibleRef = useRef(isTableVisible);
  const prevModalTypeRef = useRef(modalType);
  const prevModalSubtypeRef = useRef(modalSubtype);
  const prevActiveTabRef = useRef(activeTab);
  // Base and expanded widths based on modal type
  const getBaseWidth = (
    type: string | null,
    subtype: string | null,
    currentActiveTab: string | null,
    currentExaSearchType: string | null,
    currentExaActionType: string | null,
  ) => {
    if (type === "newProject") {
      if (currentActiveTab === "exa") {
        if (currentExaActionType === "search") {
          if (currentExaSearchType === "news_article") {
            return 750;
          } else {
            return 600;
          }
        } else {
          return 600;
        }
      }
      return 400;
    } else if (type === "column" || type === "showPrompt") {
      if (subtype === "freeForm") {
        return 800;
      } else {
        return 500;
      }
    } else if (type === "settings") {
      return 600;
    } else if (type === "summary") {
      return 700;
    } else if (type === "alert") {
      return 650;
    } else {
      return 450;
    }
  };
  const expandedWidth = 600;

  // Current width for animation
  const [currentWidth, setCurrentWidth] = useState(
    isTableVisible
      ? expandedWidth
      : getBaseWidth(
          modalType,
          modalSubtype,
          activeTab,
          exaSearchType,
          exaActionType,
        ),
  );

  // Control whether to use transition or not
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // Update width when modal type, subtype, or table visibility changes
  useEffect(() => {
    if (isOpen) {
      const modalTypeChanged = prevModalTypeRef.current !== modalType;
      const modalSubtypeChanged = prevModalSubtypeRef.current !== modalSubtype;
      const tableVisibilityChanged =
        prevTableVisibleRef.current !== isTableVisible;
      const activeTabChanged = prevActiveTabRef.current !== activeTab;
      const exaSearchTypeChanged =
        prevExaSearchTypeRef.current !== exaSearchType;
      const exaActionTypeChanged =
        prevExaActionTypeRef.current !== exaActionType;

      // Update refs
      prevTableVisibleRef.current = isTableVisible;
      prevModalTypeRef.current = modalType;
      prevModalSubtypeRef.current = modalSubtype;
      prevActiveTabRef.current = activeTab;
      prevExaSearchTypeRef.current = exaSearchType;
      prevExaActionTypeRef.current = exaActionType;

      const newWidth = isTableVisible
        ? expandedWidth
        : getBaseWidth(
            modalType,
            modalSubtype,
            activeTab,
            exaSearchType,
            exaActionType,
          );

      // Animate when table visibility changes
      if (tableVisibilityChanged && !modalTypeChanged) {
        setShouldAnimate(true);
        const delay = !isTableVisible ? 300 : 0;
        setTimeout(() => setCurrentWidth(newWidth), delay);
        const timer = setTimeout(() => setShouldAnimate(false), 650);
        return () => clearTimeout(timer);

        // Animate when modal type or subtype changes
      } else if (modalTypeChanged || modalSubtypeChanged) {
        setShouldAnimate(true);
        setTimeout(() => setCurrentWidth(newWidth), 10);
        const timer = setTimeout(() => setShouldAnimate(false), 350);
        return () => clearTimeout(timer);

        // Animate when active tab changes for the newProject modal
      } else if (
        activeTabChanged &&
        modalType === "newProject" &&
        currentWidth !== newWidth
      ) {
        setShouldAnimate(true);
        setTimeout(() => setCurrentWidth(newWidth), 10);
        const timer = setTimeout(() => setShouldAnimate(false), 350);
        return () => clearTimeout(timer);
      } else if (
        exaSearchTypeChanged &&
        modalType === "newProject" &&
        currentWidth !== newWidth
      ) {
        setShouldAnimate(true);
        setTimeout(() => setCurrentWidth(newWidth), 10);
        const timer = setTimeout(() => setShouldAnimate(false), 350);
        return () => clearTimeout(timer);
      } else if (
        exaActionTypeChanged &&
        modalType === "newProject" &&
        currentWidth !== newWidth
      ) {
        setShouldAnimate(true);
        setTimeout(() => setCurrentWidth(newWidth), 10);
        const timer = setTimeout(() => setShouldAnimate(false), 350);
        return () => clearTimeout(timer);
      }
    }
  }, [
    isTableVisible,
    modalType,
    modalSubtype,
    isOpen,
    expandedWidth,
    activeTab,
    currentWidth,
    exaSearchType,
    exaActionType,
  ]);

  // Initial modal state on open
  useEffect(() => {
    if (prevModalTypeRef.current !== modalType) {
      // No animation on initial open
      setShouldAnimate(false);
      setCurrentWidth(
        isTableVisible
          ? expandedWidth
          : getBaseWidth(
              modalType,
              modalSubtype,
              activeTab,
              exaSearchType,
              exaActionType,
            ),
      );
      prevModalTypeRef.current = modalType;
      prevModalSubtypeRef.current = modalSubtype;
      prevTableVisibleRef.current = isTableVisible;
    }
  }, [modalType, activeTab, exaSearchType]);
  const onOpenChange = () => {
    if (preventClose) {
      return;
    }
    closeModal();
    setTimeout(() => {
      setCurrentWidth(
        getBaseWidth(
          modalType,
          "singleTag",
          activeTab,
          exaSearchType,
          exaActionType,
        ),
      );
    }, 200);
  };
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="DialogTitle"
        className="!rounded-md border scroll p-0 focus-visible:outline-none"
        style={{
          width: `${currentWidth}px`,
          maxWidth: "95vw",
          maxHeight: "calc(100vh - 10px)",
          overflowY: "auto",
          scrollbarWidth: "none",
          transition: shouldAnimate
            ? "width 300ms cubic-bezier(0.4, 0, 0.2, 1)"
            : "none",
        }}
      >
        <DialogHeader className="flex flex-row items-center justify-between bg-gray-50 px-4 py-2 border-b">
          <div className="space-y-1">
            <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
            {subtitle && (
              <p className="text-[11px] font-medium text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
          {headerElement && headerElement}
        </DialogHeader>

        <div>{content}</div>

        {footer && (
          <DialogFooter className="bg-gray-100 px-4 py-2 border-t">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UniversalModal;
