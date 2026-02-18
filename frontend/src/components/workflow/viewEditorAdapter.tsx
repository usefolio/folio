import React, { useMemo, useState } from "react";
import { useDataContext } from "@/context/DataContext";
import VisualQueryBuilder from "@/components/visualQueryBuilder/visualQueryBuilder";
import { WorkflowNode, QueryBuilderState } from "@/interfaces/interfaces";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";

export interface ViewEditorAdapterProps {
  node?: WorkflowNode; // undefined ↔ new view
  onSave: (data: Partial<WorkflowNode>) => void | Promise<void>;
  onCancel: () => void;
}

const ViewEditorAdapter: React.FC<ViewEditorAdapterProps> = ({
  node,
  onSave,
  onCancel,
}) => {
  /* columns = field names  */
  const { t } = useTranslation();
  const { columns } = useDataContext();
  const fieldNames = useMemo(() => columns.map((c) => c.name), [columns]);

  /* local UI state */
  const [name, setName] = useState(node?.label ?? t("workflow.new_view"));
  const [isAddingCondition, setIsAddingCondition] = useState(false);
  const [constructedQueryVisible, setConstructedQueryVisible] = useState(false);
  const [builderState, setBuilderState] = useState<QueryBuilderState | null>(
    node?.queryBuilderState ?? null,
  );

  /* handle save */
  const handleSave = (sql: string) =>
    onSave({
      label: name.trim() || t("workflow.new_view"),
      sql_condition: sql,
      queryBuilderState: builderState ?? undefined,
    });

  return (
    <div className="space-y-4">
      {/* view name input */}
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("workflow.view_name")}
        className="rounded-md w-64 h-9"
      />

      {/* visual query builderR */}
      <VisualQueryBuilder
        viewName={name || t("workflow.new_view")}
        fields={fieldNames}
        loading={false}
        isAddingCondition={isAddingCondition}
        setIsAddingCondition={setIsAddingCondition}
        constructedQueryVisible={constructedQueryVisible}
        setConstructedQueryVisible={setConstructedQueryVisible}
        initialState={builderState ?? undefined}
        onStateChange={setBuilderState}
        onSave={handleSave}
        onCancel={onCancel}
      />
    </div>
  );
};

export default ViewEditorAdapter;
