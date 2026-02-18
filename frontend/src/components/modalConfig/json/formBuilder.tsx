import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { convertFieldsToJsonSchema } from "@/utils/jsonSchemaConverters";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FieldType, FormField } from "@/types/types";
import { FormBuilderProps } from "@/interfaces/interfaces";

// Props for the main FormBuilder component

// Visual badge that displays and allows fore changing the field type
const TypeBadge = memo(
  ({
    type,
    onChange,
    isReadOnly,
  }: {
    type: FieldType;
    onChange: (value: FieldType) => void;
    isReadOnly?: boolean;
  }) => {
    // Get appropriate color for the field type badge
    const getTypeBadgeColor = (type: FieldType): string => {
      switch (type) {
        case "text":
          return "bg-blue-100 text-blue-700 border-blue-200";
        case "number":
          return "bg-green-100 text-green-700 border-green-200";
        case "email":
          return "bg-purple-100 text-purple-700 border-purple-200";
        case "tel":
          return "bg-indigo-100 text-indigo-700 border-indigo-200";
        case "date":
          return "bg-orange-100 text-orange-700 border-orange-200";
        case "group":
          return "bg-gray-100 text-gray-700 border-gray-200";
        default:
          return "bg-gray-100 text-gray-700 border-gray-200";
      }
    };

    // Handle type change from the dropdown
    const handleChange = useCallback(
      (value: string) => {
        onChange(value as FieldType);
      },
      [onChange],
    );
    const { t } = useTranslation();
    return (
      <div
        className="relative inline-flex items-center"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Select value={type} onValueChange={handleChange}>
          <SelectTrigger
            className={cn(
              "h-5 rounded-md border px-2 py-0 text-xs font-medium mr-1",
              "min-w-[80px]",
              getTypeBadgeColor(type),
            )}
            disabled={isReadOnly}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="cursor-pointer rounded-md">
            <SelectItem
              className="text-xs rounded-md cursor-pointer"
              value="text"
            >
              {t("modal_manager.column_modal_config.json_builder.text")}
            </SelectItem>
            <SelectItem
              className="text-xs rounded-md cursor-pointer"
              value="number"
            >
              {t("modal_manager.column_modal_config.json_builder.number")}
            </SelectItem>
            <SelectItem
              className="text-xs rounded-md cursor-pointer"
              value="email"
            >
              {t("modal_manager.column_modal_config.json_builder.email")}
            </SelectItem>
            <SelectItem
              className="text-xs rounded-md cursor-pointer"
              value="tel"
            >
              {t("modal_manager.column_modal_config.json_builder.phone")}
            </SelectItem>
            <SelectItem
              className="text-xs rounded-md cursor-pointer"
              value="date"
            >
              {t("modal_manager.column_modal_config.json_builder.date")}
            </SelectItem>
            <SelectItem
              className="text-xs rounded-md cursor-pointer"
              value="group"
            >
              {t("modal_manager.column_modal_config.json_builder.group")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  },
);

// Interactive badge for each field with editing capabilities
const FieldBadge = memo(
  ({
    field,
    parentId,
    isEditing,
    editingFieldName,
    editingFieldDescription,
    startEditing,
    saveFieldName,
    setEditingFieldName,
    setEditingFieldDescription,
    toggleExpand,
    addField,
    removeField,
    updateField,
    isReadOnly,
  }: {
    field: FormField;
    parentId?: string;
    isEditing: boolean;
    editingFieldName: string;
    editingFieldDescription: string;
    startEditing: (field: FormField) => void;
    saveFieldName: (fieldId: string, parentId?: string) => void;
    setEditingFieldName: (name: string) => void;
    setEditingFieldDescription: (description: string) => void;
    toggleExpand: (fieldId: string, parentId?: string) => void;
    addField: (parentId?: string) => void;
    removeField: (fieldId: string, parentId?: string) => void;
    updateField: (
      fieldId: string,
      updates: Partial<FormField>,
      parentId?: string,
    ) => void;
    isReadOnly?: boolean;
  }) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const canHaveChildren = field.type === "group";

    // Focus input field when editing starts
    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
      }
    }, [isEditing]);

    // Handle field type change
    const handleUpdateType = useCallback(
      (value: FieldType) => {
        updateField(field.id, { type: value }, parentId);
      },
      [field.id, parentId, updateField],
    );

    // Toggle expand/collapse of child fields
    const handleToggleExpand = useCallback(() => {
      toggleExpand(field.id, parentId);
    }, [field.id, parentId, toggleExpand]);

    // Add a new sub-field to field
    const handleAddSubfield = useCallback(() => {
      addField(field.id);
    }, [field.id, addField]);

    // Remove field
    const handleRemoveField = useCallback(() => {
      removeField(field.id, parentId);
    }, [field.id, parentId, removeField]);

    // Update field name during editing
    const handleNameChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditingFieldName(e.target.value);
      },
      [setEditingFieldName],
    );

    // Update field description during editing
    const handleDescriptionChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditingFieldDescription(e.target.value);
      },
      [setEditingFieldDescription],
    );

    // Save on Enter key
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          saveFieldName(field.id, parentId);
        }
      },
      [field.id, parentId, saveFieldName],
    );

    // Start editing on badge click
    const handleBadgeClick = useCallback(
      (e: React.MouseEvent) => {
        // Only trigger editing if button or dropdown are not clicked
        if (isReadOnly) return;
        if (
          !(e.target as HTMLElement).closest("button") &&
          !(e.target as HTMLElement).closest('[role="menu"]') &&
          !(e.target as HTMLElement).closest('[role="combobox"]')
        ) {
          if (!isEditing) {
            startEditing(field);
          }
        }
      },
      [field, isEditing, startEditing],
    );

    return (
      <div
        className={cn(
          "field-badge-container",
          "inline-flex flex-col rounded-md px-2 py-2 text-sm font-medium transition-colors",
          "border border-gray-200 bg-white hover:bg-gray-50 mr-2 mb-2",
          isEditing ? "border-blue-400 bg-blue-50" : "",
          isReadOnly && "cursor-default hover:bg-white",
        )}
        onClick={handleBadgeClick}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            {/* Field name - editable inline */}
            {isEditing ? (
              <Input
                ref={inputRef}
                value={editingFieldName}
                onChange={handleNameChange}
                className="h-5 w-24 min-w-0 px-1 rounded-md !text-xs mb-1"
                onKeyDown={handleKeyDown}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                placeholder={t(
                  "modal_manager.column_modal_config.json_builder.field_name",
                )}
              />
            ) : (
              <span className="mb-1 whitespace-nowrap cursor-text text-xs">
                {field.name ||
                  t("modal_manager.column_modal_config.json_builder.unnamed")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Field type dropdown */}
            <TypeBadge
              type={field.type}
              onChange={handleUpdateType}
              isReadOnly={isReadOnly}
            />

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {canHaveChildren && (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isReadOnly}
                  className="h-4 w-4 text-gray-500 rounded-md"
                  onClick={handleToggleExpand}
                >
                  {field.isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span className="sr-only">
                    {t(
                      "modal_manager.column_modal_config.json_builder.toggle_expand",
                    )}
                  </span>
                </Button>
              )}

              {canHaveChildren && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 text-gray-500 rounded-md"
                  disabled={isReadOnly}
                  onClick={handleAddSubfield}
                  title={t(
                    "modal_manager.column_modal_config.json_builder.add_child_field",
                  )}
                >
                  <Plus className="h-3 w-3" />
                  <span className="sr-only">
                    {" "}
                    {t(
                      "modal_manager.column_modal_config.json_builder.add_child_field",
                    )}
                  </span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-gray-500 rounded-md"
                onClick={handleRemoveField}
                disabled={isReadOnly}
                title={t(
                  "modal_manager.column_modal_config.json_builder.remove_field",
                )}
              >
                <Trash2 className="h-3 w-3" />
                <span className="sr-only">
                  {t(
                    "modal_manager.column_modal_config.json_builder.remove_field",
                  )}
                </span>
              </Button>
            </div>
          </div>
        </div>
        <div>
          {/* Field description */}
          {isEditing ? (
            <Input
              value={editingFieldDescription}
              onChange={handleDescriptionChange}
              onKeyDown={handleKeyDown}
              className="h-5 px-1 rounded-md mt-2 !text-xs"
              placeholder={t(
                "modal_manager.column_modal_config.json_builder.field_description",
              )}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
          ) : field.description ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="max-w-[250px] overflow-hidden h-full break-word mt-1">
                    <span className="text-gray-500 text-[10px] break-words overflow-hidden cursor-help">
                      {field.description.length >= 36
                        ? `${field.description.substring(0, 36)}...`
                        : field.description}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="h-auto max-h-80 max-w-80 overflow-auto break-all">
                  <p className="text-xs">{field.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="mb-1 text-gray-500 text-[10px] whitespace-nowrap cursor-text text-xs">
              {t(
                "modal_manager.column_modal_config.json_builder.add_description",
              )}
            </span>
          )}
        </div>
      </div>
    );
  },
);

// Container component for child fields of a group field
const ChildrenFields = memo(
  ({
    parentField,
    renderFieldBadge,
    addField,
    isReadOnly,
  }: {
    parentField: FormField;
    renderFieldBadge: (field: FormField, parentId?: string) => JSX.Element;
    addField: (parentId?: string) => void;
    isReadOnly?: boolean;
  }) => {
    const { t } = useTranslation();

    // Add a new field to the group
    const handleAddField = useCallback(() => {
      addField(parentField.id);
    }, [parentField.id, addField]);

    return (
      <div className="ml-4 border-l border-gray-200 pl-2 mt-0">
        <div className="bg-gray-50 border border-gray-200 p-2">
          <div className="mb-2 text-xs font-medium text-gray-500">
            {parentField.name}{" "}
            {t("modal_manager.column_modal_config.json_builder.fields")}
          </div>
          <div className="flex flex-wrap items-center">
            {parentField.children.map((child) => (
              <div key={child.id}>
                {renderFieldBadge(child, parentField.id)}
              </div>
            ))}
            <Button
              variant="ghost"
              className="h-[22px] text-xs px-2 flex items-center gap-1 rounded-md"
              disabled={isReadOnly}
              onClick={handleAddField}
            >
              <Plus className="h-3 w-3" />
              {t("modal_manager.column_modal_config.json_builder.add_field")}
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

// Custom debounce hook that preserves callback reference
const useStableDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
) => {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update callback reference when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );
};

// Main FormBuilder component
export function FormBuilder({
  initialSchema,
  onSchemaChange,
  columnName,
  isReadOnly,
}: FormBuilderProps) {
  const { t } = useTranslation();
  // State for all form fields
  const [fields, setFields] = useState<FormField[]>(
    initialSchema?.fields || [],
  );
  // Track which field is being edited
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  // Current name of the field being edited
  const [editingFieldName, setEditingFieldName] = useState("");
  // Current description of the field being edited
  const [editingFieldDescription, setEditingFieldDescription] = useState("");
  // Initialize fields from schema when it changes
  useEffect(() => {
    if (initialSchema?.fields) {
      setFields(initialSchema.fields);
    }
  }, [initialSchema]);

  // Generate and memoize JSON schema for display
  const schemaJson = useMemo(() => {
    // Convert internal fields to proper JSON schema
    const jsonSchema = convertFieldsToJsonSchema(fields);
    return JSON.stringify(jsonSchema, null, 2);
  }, [fields]);

  // Debounced callback to notify parent of schema changes
  const debouncedSchemaChange = useStableDebounce((newFields: FormField[]) => {
    if (onSchemaChange) {
      // Generate JSON schema from fields
      const jsonSchema = convertFieldsToJsonSchema(newFields);

      // Add fields to the schema for internal use
      const schema = {
        ...jsonSchema,
        fields: newFields,
      };

      onSchemaChange(schema);
    }
  }, 300);

  // Trigger debounced schema update when fields or form name change
  useEffect(() => {
    debouncedSchemaChange(fields);
  }, [fields, debouncedSchemaChange, columnName]);

  // Add a new field to the form or as a child of another field
  const addField = useCallback(
    (parentId?: string) => {
      const newField: FormField = {
        id: Date.now().toString(),
        name: t("modal_manager.column_modal_config.json_builder.new_field"),
        type: "text",
        children: [],
        isExpanded: true,
        description: "",
      };

      if (!parentId) {
        setFields((prev) => [...prev, newField]);
        setEditingFieldId(newField.id);
        setEditingFieldName(newField.name);
        setEditingFieldDescription(newField.description || "");
        return;
      }

      setFields((prev) =>
        updateFieldsRecursively(prev, parentId, (field) => {
          return {
            ...field,
            children: [...field.children, newField],
            isExpanded: true,
          };
        }),
      );
      setEditingFieldId(newField.id);
      setEditingFieldName(newField.name);
      setEditingFieldDescription(newField.description || "");
    },
    [t],
  );

  // Function to update fields at any nesting level
  const updateFieldsRecursively = useCallback(
    (
      fields: FormField[],
      fieldId: string,
      updateFn: (field: FormField) => FormField,
    ): FormField[] => {
      return fields.map((field) => {
        if (field.id === fieldId) {
          return updateFn(field);
        }

        if (field.children.length > 0) {
          return {
            ...field,
            children: updateFieldsRecursively(
              field.children,
              fieldId,
              updateFn,
            ),
          };
        }

        return field;
      });
    },
    [],
  );

  // Remove a field from the form
  const removeField = useCallback(
    (fieldId: string, parentId?: string) => {
      if (editingFieldId === fieldId) {
        setEditingFieldId(null);
      }

      if (!parentId) {
        setFields((prev) => prev.filter((field) => field.id !== fieldId));
        return;
      }

      setFields((prev) =>
        updateFieldsRecursively(prev, parentId, (field) => {
          return {
            ...field,
            children: field.children.filter((child) => child.id !== fieldId),
          };
        }),
      );
    },
    [editingFieldId, updateFieldsRecursively],
  );

  // Update field properties
  const updateField = useCallback(
    (fieldId: string, updates: Partial<FormField>, parentId?: string) => {
      const updateFn = (field: FormField) => {
        // Skip update if nothing changed
        let hasChanges = false;
        for (const key in updates) {
          if (
            field[key as keyof FormField] !== updates[key as keyof FormField]
          ) {
            hasChanges = true;
            break;
          }
        }

        // If nothing changed, return the same field reference
        if (!hasChanges) return field;

        const updatedField = { ...field, ...updates };

        // If changing from group to something else, clear children
        if (
          field.type === "group" &&
          updates.type &&
          updates.type !== "group"
        ) {
          updatedField.children = [];
        }

        return updatedField;
      };

      if (!parentId) {
        setFields((prev) =>
          prev.map((field) => (field.id === fieldId ? updateFn(field) : field)),
        );
        return;
      }

      setFields((prev) =>
        updateFieldsRecursively(prev, parentId, (field) => {
          return {
            ...field,
            children: field.children.map((child) =>
              child.id === fieldId ? updateFn(child) : child,
            ),
          };
        }),
      );
    },
    [updateFieldsRecursively],
  );

  // Toggle expand/collapse of a group field
  const toggleExpand = useCallback(
    (fieldId: string, parentId?: string) => {
      const updateFn = (field: FormField) => {
        return {
          ...field,
          isExpanded: !field.isExpanded,
        };
      };

      if (!parentId) {
        setFields((prev) =>
          prev.map((field) => (field.id === fieldId ? updateFn(field) : field)),
        );
        return;
      }

      setFields((prev) =>
        updateFieldsRecursively(prev, parentId, (field) => {
          return {
            ...field,
            children: field.children.map((child) =>
              child.id === fieldId ? updateFn(child) : child,
            ),
          };
        }),
      );
    },
    [updateFieldsRecursively],
  );

  // Enter editing mode for a field
  const startEditing = useCallback((field: FormField) => {
    setEditingFieldId(field.id);
    setEditingFieldName(field.name);
    setEditingFieldDescription(field.description || "");
  }, []);

  // Find a field by ID in the nested structure
  const findField = (
    fields: FormField[],
    fieldId: string,
    parentId?: string,
  ): FormField | null => {
    if (!parentId) {
      return fields.find((f) => f.id === fieldId) || null;
    }

    const parent = fields.find((f) => f.id === parentId);
    if (parent && parent.children) {
      return parent.children.find((f) => f.id === fieldId) || null;
    }

    // Search recursively through all fields if parent not found directly
    for (const field of fields) {
      if (field.children && field.children.length > 0) {
        const foundField = findField(field.children, fieldId, parentId);
        if (foundField) return foundField;
      }
    }

    return null;
  };

  // Save field name after editing
  const saveFieldName = useCallback(
    (fieldId: string, parentId?: string) => {
      const trimmedName = editingFieldName.trim();
      const finalName = trimmedName === "" ? "Unnamed" : trimmedName;
      const trimmedDescription = editingFieldDescription.trim();

      // Find the field and check if it changed
      const field = findField(fields, fieldId, parentId);
      if (field) {
        const updates: Partial<FormField> = {};

        if (field.name !== finalName) {
          updates.name = finalName;
        }

        if (field.description !== trimmedDescription) {
          updates.description = trimmedDescription;
        }

        if (Object.keys(updates).length > 0) {
          updateField(fieldId, updates, parentId);
        }
      }

      // Defer clearing the editing state using pseudo lifecycle hook
      setTimeout(() => {
        setEditingFieldId(null);
      }, 0);
    },
    [editingFieldName, editingFieldDescription, fields, updateField],
  );

  // Handle click outside to save field name
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingFieldId) {
        // Check if the click was inside any input field
        const isInputElement = (event.target as Element)?.tagName === "INPUT";
        const isInsideFieldBadge = (event.target as Element)?.closest(
          ".field-badge-container",
        );

        if (!isInputElement && !isInsideFieldBadge) {
          // Find the current parentId by searching through fields
          const findParentId = (
            fields: FormField[],
            targetId: string,
          ): string | undefined => {
            for (const field of fields) {
              if (field.children) {
                for (const child of field.children) {
                  if (child.id === targetId) {
                    return field.id;
                  }
                }
                // Search deeper
                const nestedResult = findParentId(field.children, targetId);
                if (nestedResult) return nestedResult;
              }
            }
            return undefined;
          };

          const parentId = findParentId(fields, editingFieldId);
          saveFieldName(editingFieldId, parentId);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editingFieldId, saveFieldName, fields]);

  // Render a field badge with all its functionality
  const renderFieldBadge = useCallback(
    (field: FormField, parentId?: string) => {
      return (
        <FieldBadge
          field={field}
          parentId={parentId}
          isEditing={editingFieldId === field.id}
          editingFieldName={editingFieldName}
          editingFieldDescription={editingFieldDescription}
          startEditing={startEditing}
          saveFieldName={saveFieldName}
          setEditingFieldName={setEditingFieldName}
          setEditingFieldDescription={setEditingFieldDescription}
          toggleExpand={toggleExpand}
          addField={addField}
          removeField={removeField}
          updateField={updateField}
          isReadOnly={isReadOnly}
        />
      );
    },
    [
      editingFieldId,
      editingFieldName,
      editingFieldDescription,
      startEditing,
      saveFieldName,
      toggleExpand,
      addField,
      removeField,
      updateField,
      setEditingFieldName,
      setEditingFieldDescription,
      isReadOnly,
    ],
  );

  // Add a top-level field
  const handleAddField = useCallback(() => {
    addField();
  }, [addField]);

  return (
    <div className="space-y-3">
      <div className="p-3">
        {fields.length === 0 ? (
          <div className="border border-dashed p-6 text-center bg-gray-50">
            <p className="text-sm text-gray-500 mb-3">
              {t(
                "modal_manager.column_modal_config.json_builder.no_fields_added_yet",
              )}
            </p>
            <Button
              variant="ghost"
              onClick={handleAddField}
              disabled={isReadOnly}
              className="h-6 text-sm rounded-md"
            >
              <Plus className="mr-1 h-4 w-4" />
              {t(
                "modal_manager.column_modal_config.json_builder.add_first_field",
              )}
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className={`${field.type === "group" ? "mb-2" : ""}`}
                >
                  {renderFieldBadge(field)}

                  {/* Render nested structure if group is selected */}
                  {field.type === "group" &&
                    field.isExpanded &&
                    field.children.length > 0 && (
                      <ChildrenFields
                        parentField={field}
                        renderFieldBadge={renderFieldBadge}
                        addField={addField}
                        isReadOnly={isReadOnly}
                      />
                    )}
                </div>
              ))}

              {/* Add Field button */}
              <Button
                variant="ghost"
                className="h-[22px] text-xs px-2 flex items-center gap-1 rounded-md border border-border"
                onClick={handleAddField}
                disabled={isReadOnly}
              >
                <Plus className="h-3 w-3" />
                {t("modal_manager.column_modal_config.json_builder.add_field")}
              </Button>
            </div>
          </div>
        )}

        {fields.length > 0 && (
          <div className="mt-4 mb-2 max-w-[725px]">
            <div className="border border-border p-3">
              <div className="flex items-center mb-2 justify-between">
                <h3 className="text-sm font-medium">
                  {t(
                    "modal_manager.column_modal_config.json_builder.json_schema_preview",
                  )}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs rounded-md"
                  onClick={() => navigator.clipboard.writeText(schemaJson)}
                >
                  {t(
                    "modal_manager.column_modal_config.json_builder.copy_schema",
                  )}
                </Button>
              </div>
              <div className="bg-gray-50 border border-blue-100 p-2 overflow-auto max-h-[200px]">
                <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                  {schemaJson}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
