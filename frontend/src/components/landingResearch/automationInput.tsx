import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Building2, Users, FileText, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";

const researchCategories = [
  {
    id: "Companies",
    icon: <Building2 className="mr-1 h-4 w-4" />,
    label: "Companies",
  },
  { id: "People", icon: <Users className="mr-1 h-4 w-4" />, label: "People" },
  {
    id: "Research Papers",
    icon: <FileText className="mr-1 h-4 w-4" />,
    label: "Research Papers",
  },
  {
    id: "Legal Cases",
    icon: <Scale className="mr-1 h-4 w-4" />,
    label: "Legal Cases",
  },
];

export function AutomationInput() {
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useTranslation();
  const handleSelection = (id: string) => {
    setSelected((current) => (current === id ? null : id));
  };

  return (
    <div className="w-full mb-12">
      <div className="border rounded-md p-2 shadow-sm bg-card relative">
        <Textarea
          placeholder={t("landing_research_page.automation_input.placeholder")}
          className="border-none focus-visible:ring-0 text-base resize-none shadow-none min-h-[80px] pr-12 rounded-md"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {researchCategories.map((category) => (
            <Button
              key={category.id}
              variant={selected === category.id ? "default" : "outline"}
              size="sm"
              className="h-8 px-2 text-xs rounded-md"
              onClick={() => handleSelection(category.id)}
            >
              {category.icon}
              {category.label}
            </Button>
          ))}
        </div>
        <Button
          variant="default"
          className="absolute bottom-2 right-2 h-8 w-8 p-0 rounded-md hover:bg-orange-600"
          size="sm"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
