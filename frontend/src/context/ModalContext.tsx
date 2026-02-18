import React, {
  createContext,
  useContext,
  useState,
  useRef,
  ReactNode,
} from "react";
import { useModalManagerReducer } from "@/reducers/ModalManagerReducer";
// import type { Id } from "../../convex/_generated/dataModel";
import { ModalContextType, ModalDataContext } from "@/interfaces/interfaces";
import { ModalType } from "@/types/types";

export const ModalContext = createContext<ModalContextType | undefined>(
  undefined,
);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { state: modalState, actions } = useModalManagerReducer();
  const [isModalOpen, setModalOpen] = useState(false);
  const [isModalReady, setIsModalReady] = useState(false); // <-- Added this state
  const [modalType, setModalType] = useState<ModalType>(null);
  const [modalData, setModalData] = useState<ModalDataContext>({
    columnName: "",
    columnPrompt: null,
    columnJsonSchema: null,
  });
  const modalSessionIdRef = useRef(0);
  const closeModalTimeoutRef = useRef<number | null>(null); // <-- Added this ref

  const openModal = (type: ModalType, data: Partial<ModalDataContext> = {}) => {
    modalSessionIdRef.current += 1;
    setModalData({
      columnName: "",
      columnPrompt: null,
      columnJsonSchema: null,
      ...data,
    });

    // This special logic from your openColumnModal is preserved for a clean slate
    if (type === "column") {
      actions.clearColumnModalData();
      setModalOpen(false);
      setModalType(null);

      setTimeout(() => {
        setModalType("column");
        setIsModalReady(true);
        setModalOpen(true);
      }, 100);
    } else {
      // Standard open logic for other modals
      setModalType(type);
      setIsModalReady(true);
      setTimeout(() => setModalOpen(true), 0);
    }
  };

  const closeModal = () => {
    setModalOpen(false);

    // This logic is ported directly from your App.tsx closeModal function
    if (closeModalTimeoutRef.current) {
      clearTimeout(closeModalTimeoutRef.current);
      closeModalTimeoutRef.current = null;
    }
    if (modalType === "column") {
      actions.clearColumnModalData();
    } else if (modalType === "newProject") {
      actions.clearSelection();
      actions.clearCompletedFiles();
      actions.resetSteps();
    }

    // Set a timeout to unmount the modal manager after animations can complete
    closeModalTimeoutRef.current = window.setTimeout(() => {
      setIsModalReady(false);
      setModalType(null);
    }, 300);
  };

  return (
    <ModalContext.Provider
      value={{
        isModalOpen,
        isModalReady,
        modalType,
        modalData,
        modalState,
        modalActions: actions,
        modalSessionIdRef,
        openModal,
        closeModal,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
