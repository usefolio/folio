export function optimizeEventSystem() {
  // Track event statistics
  const eventStats: {
    totalEvents: number;
    skippedEvents: number;
    eventsByType: Record<string, number>;
    eventsByElement: Record<string, number>;
    lastAnalysis: any;
  } = {
    totalEvents: 0,
    skippedEvents: 0,
    eventsByType: {},
    eventsByElement: {},
    lastAnalysis: null,
  };

  // Store original methods
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  // Set of necessary events for forms
  const necessaryEvents = new Set([
    "click",
    "change",
    "input",
    "focus",
    "blur",
    "keydown",
    "keyup",
    "mousedown",
    "mouseup",
    "mousemove",
  ]);

  // Override addEventListener
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    // Track total events attempted
    eventStats.totalEvents++;

    // Track by event type
    eventStats.eventsByType[type] = (eventStats.eventsByType[type] || 0) + 1;

    // Track by element type
    if (this instanceof Element) {
      const tagName = this.tagName.toLowerCase();
      eventStats.eventsByElement[tagName] =
        (eventStats.eventsByElement[tagName] || 0) + 1;
    }

    // Check if this is a span with pointer-events:none
    if (
      this instanceof HTMLSpanElement &&
      this.style.pointerEvents === "none" &&
      !necessaryEvents.has(type)
    ) {
      // Track skipped events
      eventStats.skippedEvents++;
      // Skip adding the listener for unnecessary events
      return;
    }

    // Call original for necessary events
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Add global style optimization
  const style = document.createElement("style");
  style.textContent = `
    /* Optimize rendering for form components */
    .json-schema-builder .field-item {
      contain: layout style;
    }
   
    /* Only render fields currently visible */
    .json-schema-builder .field-item {
      content-visibility: auto;
      contain-intrinsic-size: 0 40px;
    }
   
    /* Reduce motion during form editing to improve performance */
    .json-schema-builder * {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  `;
  document.head.appendChild(style);

  // Define the type for getEventListeners to avoid TypeScript errors
  type EventListenersMap = Record<
    string,
    { listener: Function; useCapture: boolean }[]
  >;

  // Add analysis function to window
  interface WindowWithAnalyze extends Window {
    analyzeEvents: () => any;
    getEventListeners?: (element: Element) => EventListenersMap;
  }

  (window as unknown as WindowWithAnalyze).analyzeEvents = function () {
    const elements = document.querySelectorAll("*");
    const activeElementCount: Record<string, number> = { total: 0 };
    const activeEventCount: Record<string, number> = { total: 0 };
    const activeEventsByType: Record<string, number> = {};

    // Try to count active event listeners using Chrome DevTools API
    const win = window as unknown as WindowWithAnalyze;
    if (typeof win.getEventListeners === "function") {
      elements.forEach((elem) => {
        try {
          const listeners = win.getEventListeners?.(elem) || {};
          const listenerCount = Object.values(listeners).reduce(
            (sum, handlers) => sum + handlers.length,
            0,
          );

          if (listenerCount > 0) {
            activeElementCount.total++;
            activeEventCount.total += listenerCount;

            // Count by tag name
            const tagName = elem.tagName.toLowerCase();
            activeElementCount[tagName] =
              (activeElementCount[tagName] || 0) + 1;

            // Count by event type
            Object.entries(listeners).forEach(([type, handlers]) => {
              activeEventsByType[type] =
                (activeEventsByType[type] || 0) + handlers.length;
            });
          }
        } catch (e) {
          console.log(e);
          // Some elements might not allow getting listeners
        }
      });
    }

    // Prepare analysis result
    const result = {
      timestamp: new Date().toISOString(),
      registered: {
        total: eventStats.totalEvents,
        skipped: eventStats.skippedEvents,
        byType: Object.entries(eventStats.eventsByType)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20),
        byElement: Object.entries(eventStats.eventsByElement)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
      },
      active: {
        elements: activeElementCount,
        events: activeEventCount,
        topEventTypes: Object.entries(activeEventsByType)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20),
      },
      domSize: {
        totalElements: elements.length,
        bodyChildren: document.body.children.length,
      },
    };

    // Store last analysis
    eventStats.lastAnalysis = result;

    // Calculate optimization impact
    const optimizationImpact =
      (eventStats.skippedEvents / (eventStats.totalEvents || 1)) * 100;

    // Log results
    console.group("🔍 Event System Analysis");
    console.log(`Analysis timestamp: ${result.timestamp}`);
    console.log(`Total DOM elements: ${result.domSize.totalElements}`);

    console.group("Event Registration Stats:");
    console.log(`Total events registered: ${result.registered.total}`);
    console.log(
      `Events skipped by optimizer: ${result.registered.skipped} (${optimizationImpact.toFixed(1)}%)`,
    );
    console.log("Top event types registered:");
    console.table(
      result.registered.byType.map(([type, count]) => ({ type, count })),
    );
    console.log("Events registered by element type:");
    console.table(
      result.registered.byElement.map(([element, count]) => ({
        element,
        count,
      })),
    );
    console.groupEnd();

    if (typeof win.getEventListeners === "function") {
      console.group("Active Event Listeners:");
      console.log(
        `Elements with active listeners: ${result.active.elements.total}`,
      );
      console.log(
        `Total active event listeners: ${result.active.events.total}`,
      );
      console.log("Top active event types:");
      console.table(
        result.active.topEventTypes.map(([type, count]) => ({ type, count })),
      );
      console.groupEnd();
    } else {
      console.log(
        "Active listener analysis not available - getEventListeners is not defined",
      );
      console.log("Run in Chrome DevTools to enable full analysis");
    }

    console.groupEnd();

    return result;
  };

  console.log("Event system optimized for better performance");
  console.log("Use window.analyzeEvents() to see event statistics");
}
