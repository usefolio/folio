import { useState, useCallback, useMemo, memo } from "react";
import { FormBuilder } from "./formBuilder";
import { Button } from "@/components/ui/button";
import { Library } from "lucide-react";
import { useTranslation } from "react-i18next";
import { s1templateFields } from "./s1template";
import { templateFields10K } from "./10ktemplate";
import { templateFields10Q } from "./10qtemplate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  convertFieldsToJsonSchema,
  convertJsonSchemaToFields,
} from "@/utils/jsonSchemaConverters";
import {
  FormBuilderSchema,
  JSONSchema,
  JsonSchemaBuilderTemplate,
  FormField,
} from "@/types/types";
import { JsonSchemaBuilderProps } from "@/interfaces/interfaces";
import { encodeJsonSchema, deepSort } from "@/utils/promptUtils";

// Defines the structure of templates used in the JSON Builder
const TemplateSelector = memo(
  ({
    templates,
    onTemplateSelect,
    isReadOnly,
  }: {
    templates: JsonSchemaBuilderTemplate[];
    onTemplateSelect: (id: string) => void;
    isReadOnly?: boolean;
  }) => {
    // Provides translation functionality for internationalization
    const { t } = useTranslation();

    // Handles when a user selects a different template from the dropdown
    const handleTemplateSelect = useCallback(
      (templateId: string) => {
        onTemplateSelect(templateId);
      },
      [onTemplateSelect],
    );

    return (
      <div className="w-full">
        <div className="flex flex-row gap-2 items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={isReadOnly}
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-primary bg-background text-xs"
              >
                <Library className="h-4 w-4 mr-1" />
                {t("modal_manager.column_modal_config.check_template_library")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="h-[11.5rem]">
              <ScrollArea className="h-full">
                <div className="p-1">
                  <DropdownMenuItem
                    onSelect={() => handleTemplateSelect("none")}
                  >
                    {t(
                      "modal_manager.column_modal_config.no_saved_template_selected",
                    )}
                  </DropdownMenuItem>
                  {templates.map((template) => (
                    <DropdownMenuItem
                      key={template.id}
                      onSelect={() => handleTemplateSelect(template.id)}
                    >
                      {template.name}
                    </DropdownMenuItem>
                  ))}
                </div>
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  },
);

TemplateSelector.displayName = "TemplateSelector";

// JSON schema builder
export function JsonSchemaBuilder({
  onSchemaChange,
  initialSchema,
  columnName,
  projectName,
  savedJsonSchemas: templatesFromProps,
  isReadOnly,
}: JsonSchemaBuilderProps) {
  // State
  const [schema, setSchema] = useState<FormBuilderSchema>(() => {
    if (initialSchema) {
      // Ensure convertJsonSchemaToFields returns an object with a 'fields' property
      const conversionResult = convertJsonSchemaToFields(initialSchema);
      const derivedFields: FormField[] = conversionResult.fields || []; // Ensure fields is an array
      return { ...initialSchema, fields: derivedFields };
    }
    return { type: "object", properties: {}, fields: [] }; // Default empty FormBuilderSchema
  });

  const s1JsonSchema = useMemo((): JSONSchema => {
    return convertFieldsToJsonSchema(s1templateFields);
  }, []);
  // Convert the 10-K fields to a JSON schema
  const tenKJsonSchema = useMemo((): JSONSchema => {
    return convertFieldsToJsonSchema(templateFields10K);
  }, []);

  // Convert the 10-Q fields to a JSON schema
  const tenQJsonSchema = useMemo((): JSONSchema => {
    return convertFieldsToJsonSchema(templateFields10Q);
  }, []);
  // Built-in S1 template
  const s1BuiltInTemplate = useMemo<JsonSchemaBuilderTemplate>(
    () => ({
      id: "s1-built-in",
      name: "S-1 Filing Data Extraction Schema",
      schema: {
        ...s1JsonSchema,
        fields: s1templateFields,
      },
      isBuiltIn: true,
    }),
    [s1JsonSchema],
  );
  // 10-K built-in tempalte
  const tenKBuiltInTemplate = useMemo<JsonSchemaBuilderTemplate>(
    () => ({
      id: "10k-built-in",
      name: "10-K Annual Report Extraction Schema",
      schema: {
        ...tenKJsonSchema,
        fields: templateFields10K,
      },
      isBuiltIn: true,
    }),
    [tenKJsonSchema],
  );

  // 10-Q built-in tempalte
  const tenQBuiltInTemplate = useMemo<JsonSchemaBuilderTemplate>(
    () => ({
      id: "10q-built-in",
      name: "10-Q Quarterly Report Extraction Schema",
      schema: {
        ...tenQJsonSchema,
        fields: templateFields10Q,
      },
      isBuiltIn: true,
    }),
    [tenQJsonSchema],
  );
  // Combine built-in templates with templates from props
  // Built-in template is currently just the s1BuiltInTemplate in the files, it can expand in the future
  const allTemplates = useMemo<JsonSchemaBuilderTemplate[]>(() => {
    // This list contains SchemaTemplates (with pure JSONSchema)
    const userTemplates = templatesFromProps || []; // templatesFromProps is SchemaTemplate[]
    const combinedRawTemplates: JsonSchemaBuilderTemplate[] = [
      s1BuiltInTemplate,
      tenKBuiltInTemplate,
      tenQBuiltInTemplate,
      ...userTemplates,
    ];

    const uniqueTemplatesMap = new Map<string, JsonSchemaBuilderTemplate>();
    combinedRawTemplates.forEach((template) => {
      // template is SchemaTemplate
      // template.schema is PURE JSONSchema. Hash based on its properties.
      const schemaToHash = template.schema;

      if (
        !schemaToHash ||
        !schemaToHash.properties ||
        Object.keys(schemaToHash.properties).length === 0
      ) {
        // Handle empty or minimal schemas by ID if no meaningful content to hash
        if (!uniqueTemplatesMap.has(template.id)) {
          uniqueTemplatesMap.set(template.id, template);
        }
        return;
      }

      const normalizedContent = deepSort(schemaToHash); // Sort the pure schema
      const contentHash = encodeJsonSchema(normalizedContent);

      if (!uniqueTemplatesMap.has(contentHash)) {
        uniqueTemplatesMap.set(contentHash, template);
      } else {
        const existingTemplate = uniqueTemplatesMap.get(contentHash)!;
        if (existingTemplate.isBuiltIn && !template.isBuiltIn) {
          uniqueTemplatesMap.set(contentHash, template);
        }
      }
    });
    return Array.from(uniqueTemplatesMap.values());
  }, [s1BuiltInTemplate, templatesFromProps]);

  const handleSchemaChange = useCallback(
    (newSchema: FormBuilderSchema) => {
      setSchema(newSchema);
      // Convert the internal schema format to a clean JSON Schema for external use
      onSchemaChange(newSchema);
    },
    [onSchemaChange],
  );

  // Loads a selected template into the editor
  const loadTemplate = useCallback(
    (templateId: string) => {
      let pureSchemaToLoad: JSONSchema;
      if (templateId === "none") {
        pureSchemaToLoad = { type: "object", properties: {} };
      } else {
        const template = allTemplates.find((t) => t.id === templateId);
        pureSchemaToLoad = template
          ? template.schema
          : { type: "object", properties: {} }; // Get PURE JSONSchema
      }

      // Convert PURE JSONSchema to FormBuilderSchema for the FormBuilder
      const derivedFields = convertJsonSchemaToFields(pureSchemaToLoad).fields;
      const newFormBuilderSchema: FormBuilderSchema = {
        ...pureSchemaToLoad,
        fields: derivedFields,
      };
      setSchema(newFormBuilderSchema);

      // Notify parent with the PURE JSONSchema
      onSchemaChange(pureSchemaToLoad);
    },
    [allTemplates, onSchemaChange],
  );

  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      loadTemplate(templateId);
    },
    [loadTemplate],
  );

  return (
    <div className="space-y-1">
      <div className="flex flex-row flex-grow items-center justify-between">
        <div className="flex flex-1">
          <TemplateSelector
            templates={allTemplates}
            onTemplateSelect={handleTemplateSelect}
            isReadOnly={isReadOnly}
          />
        </div>
      </div>
      <div className="border border-gray-200 bg-white">
        <FormBuilder
          initialSchema={schema}
          onSchemaChange={handleSchemaChange}
          projectName={projectName}
          columnName={columnName}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
