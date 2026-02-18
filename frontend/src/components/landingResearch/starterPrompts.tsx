import { Github } from "lucide-react";

export function StarterPrompts() {
  const categories = [
    {
      title: "Market Research",
      prompts: [
        {
          icon: (
            <div className="w-5 h-5 bg-blue-600 text-white flex items-center justify-center rounded-md text-xs font-bold">
              M
            </div>
          ),
          title: "Market odds on Polymarket",
          description: "Retrieve current Polymarket odds for a Elon Musk to...",
        },
        {
          icon: (
            <div className="w-5 h-5 bg-blue-900 text-white flex items-center justify-center rounded-md text-xs font-bold">
              N
            </div>
          ),
          title: "Nasdaq earnings retrieval",
          description: "Retrieve all companies announcing their quarterly...",
        },
      ],
    },
    {
      title: "Sales Data Enrichment",
      prompts: [
        {
          icon: (
            <div className="w-5 h-5 bg-primary text-primary-foreground flex items-center justify-center rounded-md text-xs font-bold">
              Y
            </div>
          ),
          title: "Retrieve jobs from YC",
          description:
            "Go to the Y Combinator jobs page and get me the current...",
        },
        {
          icon: (
            <div className="w-5 h-5 bg-card border border-border text-foreground flex items-center justify-center rounded-md text-xs font-bold">
              a
            </div>
          ),
          title: "Order a Nintendo Switch",
          description: "Search Amazon for a Nintendo Switch OLED",
        },
      ],
    },
    {
      title: "General Research",
      prompts: [
        {
          icon: <Github className="w-5 h-5" />,
          title: "Get PRs for a repo",
          description:
            "Go to the Stagehand repo by Browserbase and get me the...",
        },
        {
          icon: (
            <div className="w-5 h-5 bg-card border border-border text-blue-600 flex items-center justify-center rounded-md text-xs font-bold">
              G
            </div>
          ),
          title: "Book Flights",
          description:
            "Using Google Flights, find me a one way, non-stop flight...",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {categories.map((category, categoryIndex) => (
        <div key={categoryIndex}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {category.title}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {category.prompts.map((prompt, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 border border-border rounded-md hover:bg-accent cursor-pointer transition-colors"
              >
                <div className="flex-shrink-0">{prompt.icon}</div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium text-foreground truncate">
                    {prompt.title}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate">
                    {prompt.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
