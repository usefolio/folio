export const BADGE_BASE_CLASS = "rounded-none !rounded-none px-2 py-0.5 text-xs";
export const BADGE_LABEL_CLASS = "text-[10px] font-semibold";

export const CONDITION_BADGE_CLASS = `${BADGE_BASE_CLASS} bg-orange-50`;
export const CONDITION_OPERATOR_CLASS = `${BADGE_LABEL_CLASS} text-orange-700`;

export const CONNECTOR_BADGE_CLASS = `${BADGE_BASE_CLASS} bg-blue-100`;
export const CONNECTOR_LABEL_CLASS = `${BADGE_LABEL_CLASS} text-blue-700`;

export const PAREN_BADGE_CLASS = `${BADGE_BASE_CLASS} bg-blue-50`;
export const PAREN_LABEL_CLASS = `${BADGE_LABEL_CLASS} text-blue-600`;

const badgeButtonBase =
  "inline-flex items-center justify-center border border-transparent cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-300";

export const CONNECTOR_BADGE_BUTTON_CLASS = `${CONNECTOR_BADGE_CLASS} ${badgeButtonBase} hover:bg-blue-200`;
export const PAREN_BADGE_BUTTON_CLASS = `${PAREN_BADGE_CLASS} ${badgeButtonBase} hover:bg-blue-100`;
