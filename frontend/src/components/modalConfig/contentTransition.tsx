import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const ContentTransition = ({
  children,
  keyValue,
}: {
  children: ReactNode;
  keyValue: string;
}) => (
  // Framer motion transition
  <div style={{ position: "relative" }}>
    <AnimatePresence mode="wait">
      <motion.div
        key={keyValue}
        initial={{ opacity: 0, x: 0 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ width: "100%" }}
        className="space-y-4"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  </div>
);
