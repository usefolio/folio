import {
  FormField,
  FieldType,
  JSONSchema,
  FormBuilderSchema,
} from "@/types/types"; // Adjust path as needed

// Converts the form builder's internal field structure to a standard JSON Schema
export function convertFieldsToJsonSchema(fields: FormField[]): JSONSchema {
  // Create the base schema structure
  const schema: JSONSchema & { additionalProperties?: boolean } = {
    type: "object",
    properties: generateProperties(fields),
    additionalProperties: false,
  };

  // Add all top-level fields to required array
  const requiredFields = fields.map((field) => field.name).filter(Boolean);

  if (requiredFields.length > 0) {
    schema.required = requiredFields;
  }

  return schema;
}

// Function to generate properties
function generateProperties(fields: FormField[]): Record<string, JSONSchema> {
  return fields.reduce(
    (properties, field) => {
      if (!field.name) return properties;

      if (field.type === "group" && field.children.length > 0) {
        // build the inner object schema first
        const itemObj: JSONSchema & { additionalProperties?: boolean } = {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        };

        // populate the inner object’s properties/required
        field.children.forEach((child) => {
          const schemaType = mapFieldTypeToJsonSchemaType(child.type);
          if (itemObj.properties) {
            itemObj.properties[child.name] = {
              type: schemaType,
              ...(child.description ? { description: child.description } : {}),
            };
            if (itemObj.required) {
              itemObj.required.push(child.name);
            }
          }
        });

        // attach the array-of-object definition to the parent
        properties[field.name] = {
          type: "array",
          items: itemObj,
          ...(field.description ? { description: field.description } : {}),
        };
      } else {
        // primitive / leaf
        const schemaType = mapFieldTypeToJsonSchemaType(field.type);
        properties[field.name] = {
          type: schemaType,
          ...(field.description ? { description: field.description } : {}),
        };
      }

      return properties;
    },
    {} as Record<string, JSONSchema>,
  );
}

// Convert a JSON back to the form builder internal structure
export function convertJsonSchemaToFields(jsonSchema: JSONSchema): {
  fields: FormField[];
} {
  // Start with empty fields array
  const fields: FormField[] = [];

  // Process each property in the schema
  if (jsonSchema.properties) {
    Object.entries(jsonSchema.properties).forEach(
      ([propName, propSchema], index) => {
        const field = createFieldFromProperty(
          propName,
          propSchema,
          `${index + 1}`,
        );
        fields.push(field);
      },
    );
  }

  return { fields };
}

/**
 * Recursively creates a FormField structure from a JSON schema property.
 * This function is the core of converting a raw JSON schema
 * into the nested FormField array that the FormBuilder component consumes.
 * returns a FormField object.
 */
function createFieldFromProperty(
  name: string,
  schema: JSONSchema & { description?: string },
  idPrefix: string,
): FormField {
  // Generate a unique and HTML-friendly ID for the FormField.
  // Sanitizes the name and appends a more unique suffix based on the prefix.
  const safeNamePart = name.replace(/[^a-zA-Z0-9_-]/g, "");
  const fieldId = `${idPrefix}_${safeNamePart || "field"}`;

  // Initialize a default FormField structure.
  const field: FormField = {
    id: fieldId,
    name: name,
    type: "text", // Default type, will be updated based on schema.type.
    children: [], // Initialize empty children array for potential nested fields.
    isExpanded: false, // Groups will be expanded if they have children.
    description: schema.description || "", // Use description from schema if available.
  };

  // Property is a JSON schema object with its own 'properties'.
  // This is treated as a 'group' in the FormBuilder.
  if (
    schema.type === "object" &&
    schema.properties &&
    typeof schema.properties === "object"
  ) {
    field.type = "group";
    // Recursively call createFieldFromProperty for each sub-property.
    Object.entries(schema.properties).forEach(
      ([childName, childSchema], index) => {
        const childIdPrefix = `${fieldId}-prop${index}`; // Create unique ID prefix for children
        const childField = createFieldFromProperty(
          childName,
          childSchema,
          childIdPrefix,
        );
        field.children.push(childField);
      },
    );
    // A group is expanded if it has children.
    if (field.children.length > 0) {
      field.isExpanded = true;
    }
  }
  // Property is a JSON schema array, and its 'items' are objects with 'properties'.
  // This is also treated as a 'group' in the FormBuilder, representing an array of similar objects.
  else if (
    schema.type === "array" &&
    schema.items &&
    typeof schema.items === "object" &&
    !Array.isArray(schema.items) &&
    schema.items.type === "object" && // The type of each item in the array is 'object'
    schema.items.properties && // The 'items' object schema has a 'properties' field
    typeof schema.items.properties === "object" // And that 'properties' field is an object
  ) {
    field.type = "group";
    // The 'properties' of 'schema.items' define the structure of each object in the array.
    // These become the children of this group FormField.
    const itemsProperties = schema.items.properties;

    Object.entries(itemsProperties).forEach(
      ([childName, childPropertySchema], index) => {
        const childIdPrefix = `${fieldId}-item${index}`; // Unique ID prefix for children
        const childField = createFieldFromProperty(
          childName,
          childPropertySchema, // This is the schema for a property like "Group Child".
          childIdPrefix,
        );
        field.children.push(childField);
      },
    );
    // A group is expanded if it has children.
    if (field.children.length > 0) {
      field.isExpanded = true;
    }
  }
  // Property is of type string, number, boolean etc, or an unhandled array type.
  else {
    field.type = mapJsonSchemaTypeToFieldType(schema);
    // Non-group fields are not expandable in the context of having children.
    if (field.type !== "group") {
      field.isExpanded = undefined;
    }
  }

  return field;
}

// Map formBuilder field types to JSON types
function mapFieldTypeToJsonSchemaType(fieldType: FieldType): string {
  switch (fieldType) {
    case "number":
      return "number";
    case "text":
    case "email":
    case "tel":
    case "date":
    default:
      return "string";
  }
}
// Map JSON  types to formBuilder field types
function mapJsonSchemaTypeToFieldType(schema: JSONSchema): FieldType {
  // Check data type
  switch (schema.type) {
    case "number":
    case "integer":
      return "number";
    case "string":
    default:
      return "text";
  }
}

// Prepare the JSON schema for API submission
export function prepareSchemaForSubmission(
  schema: FormBuilderSchema,
): JSONSchema {
  const cleanSchema: JSONSchema & { additionalProperties?: boolean } = {
    type: "object",
    properties: {},
    additionalProperties: false,
    required: [],
  };

  // copy or regenerate properties
  if (schema.properties) {
    cleanSchema.properties = schema.properties;
  } else if (schema.fields) {
    cleanSchema.properties = generateProperties(schema.fields);
  }

  // build required list — INCLUDE groups
  if (schema.fields) {
    const requiredFields = (schema.fields as FormField[])
      .map((f) => f.name)
      .filter(Boolean);

    // ⬇⬇  assign to *cleanSchema*, not schema
    if (requiredFields.length) cleanSchema.required = requiredFields;
  }

  return cleanSchema;
}
