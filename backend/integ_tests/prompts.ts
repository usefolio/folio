export const CALL_CENTER_CLASSIFICATION_PROMPT = {
    model: "gpt-4o",
    system_prompt:
        "You are a call center supervisor with a lot of experience listening in on calls between call center representatives and customers. ",
    user_prompt_template:
        "tell me what category this transcribed call best describes: \n\n{{ input }}",
    response_format: {
        type: "json_schema",
        json_schema: {
            name: "Classification",
            schema: {
                type: "object",
                properties: {
                    extraction_keyword: {
                        type: "string",
                        enum: ["payments", "complaint", "warranty", "other"],
                    },
                },
                required: ["extraction_keyword"],
            },
        },
    },
    extraction_keyword: "extraction_keyword",
} as const;
